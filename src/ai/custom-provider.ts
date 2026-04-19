import { BaseProvider } from "./provider.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  StreamCallback,
} from "./types.js";
import type { ProviderConfig } from "./types.js";
import { logger } from "../utils/logger.js";

export class CustomProvider extends BaseProvider {
  readonly id = "custom";
  readonly name = "Custom";

  constructor(config: ProviderConfig) {
    super(config);
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = this.buildUrl("/chat/completions");
    const headers = this.buildHeaders();

    const body = {
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      stream: false,
      stop: request.stop,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom provider API error: ${response.status} ${errorText}`);
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      logger.error(`Custom provider chat error: ${error}`);
      throw error;
    }
  }

  async chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse> {
    const url = this.buildUrl("/chat/completions");
    const headers = this.buildHeaders();

    const body = {
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      stream: true,
      stop: request.stop,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom provider API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let fullContent = "";
      const toolCalls: Array<{
        index: number;
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }> = [];
      let finishReason = "stop";
      let modelId = request.model;
      let responseId = "";
      let usage: ChatCompletionResponse["usage"] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data) as ChatCompletionChunk;
            responseId = chunk.id;
            modelId = chunk.model;

            if (chunk.usage) {
              usage = chunk.usage;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (delta?.content) {
              fullContent += delta.content;
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.find((t) => t.index === tc.index);
                if (existing) {
                  if (tc.function?.name) existing.function.name = tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  if (tc.id) existing.id = tc.id;
                } else {
                  toolCalls.push({
                    index: tc.index,
                    id: tc.id ?? "",
                    type: "function",
                    function: {
                      name: tc.function?.name ?? "",
                      arguments: tc.function?.arguments ?? "",
                    },
                  });
                }
              }
            }

            callback(chunk);
          } catch {
            // Skip malformed JSON
          }
        }
      }

      const message: ChatCompletionResponse["choices"][0]["message"] = {
        role: "assistant",
        content: fullContent || null,
      };

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls
          .sort((a, b) => a.index - b.index)
          .map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: tc.function,
          }));
      }

      return {
        id: responseId,
        model: modelId,
        choices: [
          {
            index: 0,
            message,
            finish_reason: finishReason as ChatCompletionResponse["choices"][0]["finish_reason"],
          },
        ],
        usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (error) {
      logger.error(`Custom provider stream error: ${error}`);
      throw error;
    }
  }

  private buildUrl(path: string): string {
    const base = this.getApiUrl().replace(/\/+$/, "");
    return `${base}${path}`;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.getApiKey()}`,
    };
  }
}

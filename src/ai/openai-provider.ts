import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions.js";
import { BaseProvider } from "./provider.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamCallback,
} from "./types.js";
import type { ProviderConfig } from "./types.js";
import { logger } from "../utils/logger.js";

export class OpenAIProvider extends BaseProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiUrl || undefined,
    });
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: this.convertMessages(request.messages),
        tools: request.tools as OpenAI.ChatCompletionTool[] | undefined,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        stop: request.stop,
        stream: false,
      });

      return this.convertResponse(response);
    } catch (error) {
      logger.error(`OpenAI chat error: ${error}`);
      throw error;
    }
  }

  async chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse> {
    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        messages: this.convertMessages(request.messages),
        tools: request.tools as OpenAI.ChatCompletionTool[] | undefined,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        stop: request.stop,
        stream: true,
      });

      let fullContent = "";
      let toolCalls: Array<{
        index: number;
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }> = [];
      let finishReason: string = "stop";
      let modelId = request.model;
      let responseId = "";
      let usage: ChatCompletionResponse["usage"] | undefined;

      for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        responseId = chunk.id;
        modelId = chunk.model;

        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          };
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

        callback({
          id: chunk.id,
          model: chunk.model,
          choices: [
            {
              index: 0,
              delta: {
                role: delta?.role as "assistant" | undefined,
                content: delta?.content ?? undefined,
                tool_calls: delta?.tool_calls?.map((tc) => ({
                  index: tc.index,
                  id: tc.id,
                  type: "function" as const,
                  function: {
                    name: tc.function?.name,
                    arguments: tc.function?.arguments,
                  },
                })),
              },
              finish_reason: choice.finish_reason as ChatCompletionResponse["choices"][0]["finish_reason"] | null,
            },
          ],
          usage: chunk.usage
            ? {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
                total_tokens: chunk.usage.total_tokens,
              }
            : undefined,
        });
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
            finish_reason: this.normalizeFinishReason(finishReason),
          },
        ],
        usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (error) {
      logger.error(`OpenAI stream error: ${error}`);
      throw error;
    }
  }

  private convertMessages(
    messages: ChatCompletionRequest["messages"],
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "system" as const, content: msg.content };
      }
      if (msg.role === "user") {
        return { role: "user" as const, content: msg.content };
      }
      if (msg.role === "assistant") {
        if (msg.tool_calls) {
          return {
            role: "assistant" as const,
            content: msg.content,
            tool_calls: msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          };
        }
        return { role: "assistant" as const, content: msg.content };
      }
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          content: msg.content,
          tool_call_id: msg.tool_call_id ?? "",
        };
      }
      return { role: "user" as const, content: msg.content };
    });
  }

  private convertResponse(response: OpenAI.ChatCompletion): ChatCompletionResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No choices in response");
    }
    return {
      id: response.id,
      model: response.model,
      choices: [
        {
          index: choice.index,
          message: {
            role: "assistant",
            content: choice.message.content ?? null,
            tool_calls: choice.message.tool_calls?.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          },
          finish_reason: this.normalizeFinishReason(choice.finish_reason ?? "stop"),
        },
      ],
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  private normalizeFinishReason(reason: string): ChatCompletionResponse["choices"][0]["finish_reason"] {
    if (reason === "tool_calls" || reason === "stop" || reason === "length" || reason === "content_filter") {
      return reason;
    }
    return "stop";
  }
}

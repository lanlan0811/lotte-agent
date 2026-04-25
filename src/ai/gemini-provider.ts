import { BaseProvider } from "./provider.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamCallback,
  ChatMessage,
  ContentPart,
  ToolCall,
  ProviderConfig,
} from "./types.js";
import { AI_TIMEOUT_MS, extractTextContent } from "./types.js";
import { logger } from "../utils/logger.js";

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: Record<string, unknown> };
  }>;
}

interface GeminiToolDeclaration {
  name: string;
  description?: string;
  parameters?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface GeminiRequest {
  contents: GeminiContent[];
  tools?: Array<{
    functionDeclarations: GeminiToolDeclaration[];
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    stopSequences?: string[];
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts: Array<{
        text?: string;
        functionCall?: { name: string; args: Record<string, unknown> };
      }>;
      role: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";

  constructor(config: ProviderConfig) {
    super(config);
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const geminiRequest = this.convertRequest(request);
    const url = this.buildUrl(request.model, false);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.getApiKey(),
        },
        body: JSON.stringify(geminiRequest),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS.LONG_RUNNING),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as GeminiResponse;
      return this.convertResponse(data, request.model);
    } catch (error) {
      logger.error(`Gemini chat error: ${error}`);
      throw error;
    }
  }

  async chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse> {
    const geminiRequest = this.convertRequest(request);
    const url = this.buildUrl(request.model, true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.getApiKey(),
        },
        body: JSON.stringify(geminiRequest),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS.LONG_RUNNING),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body for streaming");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      const allToolCalls: ToolCall[] = [];
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const chunk = JSON.parse(jsonStr) as GeminiResponse;
            const candidate = chunk.candidates?.[0];
            if (!candidate?.content?.parts) continue;

            for (const part of candidate.content.parts) {
              if (part.text) {
                fullContent += part.text;
                callback({
                  id: `gemini-stream-${Date.now()}`,
                  model: request.model,
                  choices: [{
                    index: 0,
                    delta: { role: "assistant", content: part.text },
                    finish_reason: null,
                  }],
                });
              }

              if (part.functionCall) {
                const toolCall: ToolCall = {
                  id: `call_${allToolCalls.length}`,
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args),
                  },
                };
                allToolCalls.push(toolCall);
              }
            }

            if (chunk.usageMetadata) {
              totalPromptTokens = chunk.usageMetadata.promptTokenCount;
              totalCompletionTokens = chunk.usageMetadata.candidatesTokenCount;
            }
          } catch (e) {
            logger.debug(`Skipping malformed stream chunk: ${e}`);
          }
        }
      }

      const finishReason = allToolCalls.length > 0 ? "tool_calls" : "stop";

      return {
        id: `gemini-${Date.now()}`,
        model: request.model,
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: fullContent || null,
            tool_calls: allToolCalls.length > 0 ? allToolCalls : undefined,
          },
          finish_reason: finishReason as ChatCompletionResponse["choices"][0]["finish_reason"],
        }],
        usage: {
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        },
      };
    } catch (error) {
      logger.error(`Gemini stream error: ${error}`);
      throw error;
    }
  }

  private buildUrl(model: string, stream: boolean): string {
    const baseUrl = this.getApiUrl() || "https://generativelanguage.googleapis.com";
    const action = stream ? "streamGenerateContent" : "generateContent";
    return `${baseUrl}/v1beta/models/${model}:${action}`;
  }

  private convertRequest(request: ChatCompletionRequest): GeminiRequest {
    const contents = this.convertMessages(request.messages);

    const geminiRequest: GeminiRequest = { contents };

    if (request.tools && request.tools.length > 0) {
      geminiRequest.tools = [{
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters as GeminiToolDeclaration["parameters"],
        })),
      }];
    }

    if (request.temperature !== undefined || request.max_tokens !== undefined || request.top_p !== undefined || request.stop) {
      geminiRequest.generationConfig = {};
      if (request.temperature !== undefined) geminiRequest.generationConfig.temperature = request.temperature;
      if (request.max_tokens !== undefined) geminiRequest.generationConfig.maxOutputTokens = request.max_tokens;
      if (request.top_p !== undefined) geminiRequest.generationConfig.topP = request.top_p;
      if (request.stop) geminiRequest.generationConfig.stopSequences = request.stop;
    }

    return geminiRequest;
  }

  private convertMessages(messages: ChatMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case "system":
          contents.push({
            role: "user",
            parts: [{ text: `[System Instructions]\n${extractTextContent(msg.content)}` }],
          });
          contents.push({
            role: "model",
            parts: [{ text: "Understood. I will follow these instructions." }],
          });
          break;

        case "user": {
          if (typeof msg.content !== "string" && msg.content.some((p) => p.type === "image_url")) {
            const parts: GeminiContent["parts"] = [];
            for (const part of msg.content) {
              if (part.type === "text") {
                parts.push({ text: part.text });
              } else if (part.type === "image_url") {
                const url = part.image_url.url;
                if (url.startsWith("data:")) {
                  const match = url.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    parts.push({
                      inlineData: {
                        mimeType: match[1],
                        data: match[2],
                      },
                    } as unknown as GeminiContent["parts"][number]);
                  }
                } else {
                  parts.push({ text: `[Image URL: ${url}]` });
                }
              }
            }
            contents.push({ role: "user", parts });
          } else {
            contents.push({
              role: "user",
              parts: [{ text: extractTextContent(msg.content) }],
            });
          }
          break;
        }

        case "assistant":
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            contents.push({
              role: "model",
              parts: msg.tool_calls.map((tc) => ({
                functionCall: {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments),
                },
              })),
            });
          } else {
            contents.push({
              role: "model",
              parts: [{ text: extractTextContent(msg.content) || "" }],
            });
          }
          break;

        case "tool":
          try {
            const responseArgs = JSON.parse(extractTextContent(msg.content));
            contents.push({
              role: "user",
              parts: [{
                functionResponse: {
                  name: msg.name || "unknown",
                  response: responseArgs,
                },
              }],
            });
          } catch (e) {
            logger.debug(`Failed to parse function response, falling back to text: ${e}`);
            contents.push({
              role: "user",
              parts: [{
                functionResponse: {
                  name: msg.name || "unknown",
                  response: { result: extractTextContent(msg.content) },
                },
              }],
            });
          }
          break;
      }
    }

    return contents;
  }

  private convertResponse(data: GeminiResponse, model: string): ChatCompletionResponse {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        content = (content || "") + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }

    const finishReason = this.mapFinishReason(candidate?.finishReason, toolCalls.length > 0);

    return {
      id: `gemini-${Date.now()}`,
      model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }

  private mapFinishReason(
    reason: string | undefined,
    hasToolCalls: boolean,
  ): ChatCompletionResponse["choices"][0]["finish_reason"] {
    if (hasToolCalls) return "tool_calls";
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
        return "content_filter";
      default:
        return "stop";
    }
  }
}

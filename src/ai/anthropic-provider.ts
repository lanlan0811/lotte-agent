import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./provider.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamCallback,
  ChatMessage,
  ToolCall,
} from "./types.js";
import type { ProviderConfig } from "./types.js";
import { logger } from "../utils/logger.js";

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.apiUrl || undefined,
    });
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const { system, messages } = this.extractSystemPrompt(request.messages);
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.max_tokens ?? 4096,
        system: system || undefined,
        messages: this.convertMessages(messages),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
        temperature: request.temperature,
        top_p: request.top_p,
        stop_sequences: request.stop,
      });

      return this.convertResponse(response, request.model);
    } catch (error) {
      logger.error(`Anthropic chat error: ${error}`);
      throw error;
    }
  }

  async chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse> {
    try {
      const { system, messages } = this.extractSystemPrompt(request.messages);
      const stream = this.client.messages.stream({
        model: request.model,
        max_tokens: request.max_tokens ?? 4096,
        system: system || undefined,
        messages: this.convertMessages(messages),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
        temperature: request.temperature,
        top_p: request.top_p,
        stop_sequences: request.stop,
      });

      let fullContent = "";
      const toolCalls: Array<{
        index: number;
        id: string;
        name: string;
        arguments: string;
      }> = [];
      let finishReason = "stop";
      let responseId = `msg_${Date.now()}`;
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      stream.on("text", (text: string) => {
        fullContent += text;
        callback({
          id: responseId,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: text },
              finish_reason: null,
            },
          ],
        });
      });

      const finalMessage = await stream.finalMessage();

      if (finalMessage.usage) {
        usage = {
          prompt_tokens: finalMessage.usage.input_tokens,
          completion_tokens: finalMessage.usage.output_tokens,
          total_tokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        };
      }

      const assistantMessage: ChatCompletionResponse["choices"][0]["message"] = {
        role: "assistant",
        content: fullContent || null,
      };

      for (const block of finalMessage.content) {
        if (block.type === "tool_use") {
          toolCalls.push({
            index: toolCalls.length,
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          });
        }
      }

      if (finalMessage.stop_reason === "tool_use") {
        finishReason = "tool_calls";
      } else if (finalMessage.stop_reason === "max_tokens") {
        finishReason = "length";
      }

      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      return {
        id: finalMessage.id,
        model: finalMessage.model,
        choices: [
          {
            index: 0,
            message: assistantMessage,
            finish_reason: this.normalizeFinishReason(finishReason),
          },
        ],
        usage,
      };
    } catch (error) {
      logger.error(`Anthropic stream error: ${error}`);
      throw error;
    }
  }

  private extractSystemPrompt(messages: ChatMessage[]): {
    system: string;
    messages: ChatMessage[];
  } {
    const systemParts: string[] = [];
    const otherMessages: ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        otherMessages.push(msg);
      }
    }

    return { system: systemParts.join("\n\n"), messages: otherMessages };
  }

  private convertMessages(
    messages: ChatMessage[],
  ): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const content: Anthropic.TextBlockParam[] = [];
          if (msg.content) {
            content.push({ type: "text", text: msg.content });
          }
          const toolUseBlocks: Anthropic.ToolUseBlockParam[] = msg.tool_calls.map((tc) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          }));
          result.push({
            role: "assistant",
            content: [...content, ...toolUseBlocks],
          });
        } else {
          result.push({ role: "assistant", content: msg.content });
        }
      } else if (msg.role === "tool") {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id ?? "",
              content: msg.content,
            } as Anthropic.ToolResultBlockParam,
          ],
        });
      }
    }

    return result;
  }

  private convertTools(
    tools: ChatCompletionRequest["tools"],
  ): Anthropic.Tool[] {
    return tools!.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
    }));
  }

  private convertResponse(
    response: Anthropic.Message,
    modelId: string,
  ): ChatCompletionResponse {
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content = (content ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    const finishReason = response.stop_reason === "tool_use"
      ? "tool_calls"
      : response.stop_reason === "max_tokens"
        ? "length"
        : "stop";

    const message: ChatCompletionResponse["choices"][0]["message"] = {
      role: "assistant",
      content,
    };

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    return {
      id: response.id,
      model: modelId,
      choices: [
        {
          index: 0,
          message,
          finish_reason: this.normalizeFinishReason(finishReason),
        },
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
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

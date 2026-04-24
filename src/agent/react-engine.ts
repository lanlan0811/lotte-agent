import type { ChatMessage, ChatCompletionResponse, StreamCallback } from "../ai/types.js";
import type { ModelManager } from "../ai/model-manager.js";
import type { InMemoryMemory } from "../memory/short-term.js";
import type { ContextCompactor } from "../memory/compactor.js";
import type { Session } from "./session.js";
import { ToolInvoker } from "./tool-invoker.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export interface ReActEngineConfig {
  maxTurns: number;
  maxTokens: number;
  temperature: number;
  streamEnabled: boolean;
  compactOnThreshold: boolean;
  compactThreshold: number;
}

const DEFAULT_REACT_CONFIG: ReActEngineConfig = {
  maxTurns: 25,
  maxTokens: 128000,
  temperature: 0.7,
  streamEnabled: true,
  compactOnThreshold: true,
  compactThreshold: 0.8,
};

export interface ReActResult {
  response: string;
  toolCallsMade: number;
  totalTokens: number;
  turns: number;
  finished: boolean;
  finishReason: string;
}

export type ReActEventCallback = (event: ReActEvent) => void;

export type ReActEvent =
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "tool_result"; name: string; result: string }
  | { type: "response"; content: string }
  | { type: "error"; error: string }
  | { type: "compaction"; summary: string }
  | { type: "turn_complete"; turn: number };

export class ReActEngine {
  private modelManager: ModelManager;
  private toolInvoker: ToolInvoker;
  private memory: InMemoryMemory;
  private compactor?: ContextCompactor;
  private config: ReActEngineConfig;
  private eventCallback?: ReActEventCallback;

  constructor(options: {
    modelManager: ModelManager;
    toolInvoker: ToolInvoker;
    memory: InMemoryMemory;
    compactor?: ContextCompactor;
    config?: Partial<ReActEngineConfig>;
  }) {
    this.modelManager = options.modelManager;
    this.toolInvoker = options.toolInvoker;
    this.memory = options.memory;
    this.compactor = options.compactor;
    this.config = { ...DEFAULT_REACT_CONFIG, ...options.config };
  }

  onEvent(callback: ReActEventCallback): void {
    this.eventCallback = callback;
  }

  async run(
    session: Session,
    userMessage: string,
    streamCallback?: StreamCallback,
  ): Promise<ReActResult> {
    this.memory.addMessage({ role: "user", content: userMessage });

    let totalTokens = 0;
    let toolCallsMade = 0;
    let finished = false;
    let finishReason = "max_turns";
    let lastResponse = "";

    while (!finished && session.isActive() && !session.hasReachedMaxTurns()) {
      session.incrementTurn();

      const contextMessages = this.buildContextMessages(session);
      const tools = this.toolInvoker.getEnabledTools(
        session.config.toolsEnabled.length > 0 ? session.config.toolsEnabled : undefined,
        session.config.toolsDisabled.length > 0 ? session.config.toolsDisabled : undefined,
      );

      try {
        let response: ChatCompletionResponse;

        if (this.config.streamEnabled && streamCallback) {
          response = await this.modelManager.chatStream(
            {
              model: session.config.model ?? this.modelManager.getDefaultModel(),
              messages: contextMessages,
              tools: tools.length > 0 ? tools : undefined,
              temperature: this.config.temperature,
              max_tokens: this.config.maxTokens,
              stream: true,
            },
            streamCallback,
          );
        } else {
          response = await this.modelManager.chat({
            model: session.config.model ?? this.modelManager.getDefaultModel(),
            messages: contextMessages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
          });
        }

        totalTokens += response.usage?.total_tokens ?? 0;
        session.addTokensUsed(response.usage?.total_tokens ?? 0);

        const choice = response.choices[0];
        if (!choice) {
          finishReason = "no_response";
          finished = true;
          break;
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: choice.message.content ?? "",
        };

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          assistantMessage.tool_calls = choice.message.tool_calls;
        }

        this.memory.addMessage(assistantMessage);

        if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
          this.emitEvent({ type: "thinking", content: choice.message.content ?? "" });

          const toolResults = await this.toolInvoker.invokeAll(choice.message.tool_calls);
          toolCallsMade += choice.message.tool_calls.length;

          for (let i = 0; i < choice.message.tool_calls.length; i++) {
            const tc = choice.message.tool_calls[i];
            const result = toolResults[i];
            if (!tc || !result) continue;
            this.emitEvent({
              type: "tool_call",
              name: tc.function.name,
              arguments: tc.function.arguments,
            });
            this.emitEvent({
              type: "tool_result",
              name: tc.function.name,
              result: result.content.slice(0, 500),
            });
            this.memory.addMessage(result);
          }
        } else {
          lastResponse = choice.message.content ?? "";
          this.emitEvent({ type: "response", content: lastResponse });

          if (choice.finish_reason === "stop") {
            finishReason = "stop";
            finished = true;
          } else if (choice.finish_reason === "length") {
            finishReason = "length";
            finished = true;
          }
        }

        this.emitEvent({ type: "turn_complete", turn: session.state.currentTurn });

        if (this.config.compactOnThreshold && this.compactor) {
          const currentTokens = this.memory.estimateTokens();
          const maxTokens = this.modelManager.getContextWindow(
            session.config.model ?? this.modelManager.getDefaultModel(),
          );

          if (this.compactor.shouldCompact(currentTokens, maxTokens)) {
            await this.performCompaction(maxTokens);
          }
        }
      } catch (error) {
        const errorMsg = formatErrorMessage(error);
        logger.error(`ReAct loop error: ${errorMsg}`);
        this.emitEvent({ type: "error", error: errorMsg });
        finishReason = "error";
        finished = true;
      }
    }

    if (!finished) {
      finishReason = "max_turns";
    }

    return {
      response: lastResponse,
      toolCallsMade,
      totalTokens,
      turns: session.state.currentTurn,
      finished: true,
      finishReason,
    };
  }

  private buildContextMessages(session: Session): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (session.config.systemPrompt) {
      messages.push({ role: "system", content: session.config.systemPrompt });
    }

    const contextMaxTokens = Math.floor(
      this.modelManager.getContextWindow(
        session.config.model ?? this.modelManager.getDefaultModel(),
      ) * 0.8,
    );

    const contextMessages = this.memory.getMessagesForContext(contextMaxTokens);
    messages.push(...contextMessages);

    return messages;
  }

  private async performCompaction(maxTokens: number): Promise<void> {
    if (!this.compactor) return;

    try {
      const messages = this.memory.getChatMessages();
      const result = await this.compactor.compact(messages, maxTokens);

      this.memory.clear();

      const summaryMessage: ChatMessage = {
        role: "system",
        content: `[Conversation Summary]\n${result.summary}`,
      };
      this.memory.addMessage(summaryMessage);

      this.emitEvent({ type: "compaction", summary: result.summary.slice(0, 200) });
      logger.info(`Context compacted: ${result.originalMessageCount} -> ${result.compressedMessageCount} messages`);
    } catch (error) {
      logger.error(`Compaction failed: ${error}`);
    }
  }

  private emitEvent(event: ReActEvent): void {
    this.eventCallback?.(event);
  }
}

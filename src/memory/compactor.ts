import type { ChatMessage } from "../ai/types.js";
import type { ModelManager } from "../ai/model-manager.js";
import { logger } from "../utils/logger.js";

export interface CompactionConfig {
  triggerRatio: number;
  targetRatio: number;
  chunkRatio: number;
  minChunkRatio: number;
  safetyMargin: number;
  maxCompactionRetries: number;
}

const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  triggerRatio: 0.8,
  targetRatio: 0.4,
  chunkRatio: 0.4,
  minChunkRatio: 0.15,
  safetyMargin: 1.2,
  maxCompactionRetries: 2,
};

const SUMMARIZATION_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create concise summaries that preserve:
- Active tasks and their current status
- Key decisions and their rationale
- Important context needed for continuity
- Open questions and constraints
- The most recent user request and what was being done

Prioritize recent context over older history. Be concise but complete.`;

export interface CompactionResult {
  summary: string;
  originalMessageCount: number;
  compressedMessageCount: number;
  tokensSaved: number;
}

export class ContextCompactor {
  private modelManager: ModelManager;
  private config: CompactionConfig;

  constructor(modelManager: ModelManager, config?: Partial<CompactionConfig>) {
    this.modelManager = modelManager;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  shouldCompact(currentTokens: number, maxTokens: number): boolean {
    const ratio = currentTokens / maxTokens;
    return ratio >= this.config.triggerRatio;
  }

  async compact(
    messages: ChatMessage[],
    maxTokens: number,
    previousSummary?: string,
  ): Promise<CompactionResult> {
    const originalCount = messages.length;
    const targetTokens = Math.floor(maxTokens * this.config.targetRatio);

    const messagesToCompact = this.selectMessagesForCompaction(messages, targetTokens);
    const preservedMessages = messages.slice(messagesToCompact.length);

    const summary = await this.generateSummary(
      messagesToCompact,
      targetTokens,
      previousSummary,
    );

    const summaryMessage: ChatMessage = {
      role: "system",
      content: `[Conversation Summary]\n${summary}`,
    };

    const compressedMessages = [summaryMessage, ...preservedMessages];
    const tokensSaved = this.estimateTokens(messages) - this.estimateTokens(compressedMessages);

    logger.info(
      `Compacted ${originalCount} messages to ${compressedMessages.length}, saved ~${tokensSaved} tokens`,
    );

    return {
      summary,
      originalMessageCount: originalCount,
      compressedMessageCount: compressedMessages.length,
      tokensSaved,
    };
  }

  async generateSummary(
    messages: ChatMessage[],
    reserveTokens: number,
    previousSummary?: string,
  ): Promise<string> {
    if (messages.length === 0) {
      return previousSummary ?? "No prior conversation history.";
    }

    const chunks = this.chunkMessages(messages, reserveTokens);
    const summaries: string[] = [];

    if (previousSummary) {
      summaries.push(previousSummary);
    }

    for (const chunk of chunks) {
      const chunkSummary = await this.summarizeChunk(chunk);
      summaries.push(chunkSummary);
    }

    if (summaries.length > 1) {
      return this.mergeSummaries(summaries);
    }

    return summaries[0] ?? "No prior conversation history.";
  }

  private selectMessagesForCompaction(messages: ChatMessage[], targetTokens: number): ChatMessage[] {
    let totalTokens = this.estimateTokens(messages);
    let cutIndex = 0;

    while (totalTokens > targetTokens * this.config.safetyMargin && cutIndex < messages.length - 2) {
      const msg = messages[cutIndex];
      if (msg) totalTokens -= this.estimateTokens([msg]);
      cutIndex++;
    }

    if (cutIndex > 0 && messages[cutIndex - 1]?.role === "assistant") {
      const lastToolCall = messages[cutIndex - 1]?.tool_calls;
      if (lastToolCall) {
        cutIndex = Math.max(0, cutIndex - 1);
      }
    }

    return messages.slice(0, cutIndex);
  }

  private chunkMessages(messages: ChatMessage[], reserveTokens: number): ChatMessage[][] {
    const chunkSize = Math.floor(reserveTokens * this.config.chunkRatio);
    const minSize = Math.floor(reserveTokens * this.config.minChunkRatio);
    const effectiveChunkSize = Math.max(chunkSize, minSize);

    const chunks: ChatMessage[][] = [];
    let currentChunk: ChatMessage[] = [];
    let currentTokens = 0;

    for (const msg of messages) {
      const msgTokens = this.estimateTokens([msg]);

      if (currentTokens + msgTokens > effectiveChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(msg);
      currentTokens += msgTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async summarizeChunk(messages: ChatMessage[]): Promise<string> {
    try {
      const conversationText = messages
        .map((m) => `[${m.role}]: ${m.content}`)
        .join("\n");

      const response = await this.modelManager.chat({
        model: this.modelManager.getDefaultModel(),
        messages: [
          { role: "system", content: SUMMARIZATION_SYSTEM_PROMPT },
          { role: "user", content: `Summarize this conversation chunk:\n\n${conversationText}` },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content ?? "Summary unavailable.";
    } catch (error) {
      logger.error(`Failed to summarize chunk: ${error}`);
      return "Summary generation failed.";
    }
  }

  private async mergeSummaries(summaries: string[]): Promise<string> {
    if (summaries.length <= 1) return summaries[0] ?? "";

    try {
      const combinedText = summaries
        .map((s, i) => `Part ${i + 1}:\n${s}`)
        .join("\n\n");

      const response = await this.modelManager.chat({
        model: this.modelManager.getDefaultModel(),
        messages: [
          {
            role: "system",
            content: `Merge these partial summaries into a single cohesive summary.

MUST PRESERVE:
- Active tasks and their current status (in-progress, blocked, pending)
- The last thing the user requested and what was being done about it
- Decisions made and their rationale
- TODOs, open questions, and constraints
- Any commitments or follow-ups promised

PRIORITIZE recent context over older history.`,
          },
          { role: "user", content: combinedText },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content ?? summaries.join("\n\n");
    } catch (error) {
      logger.error(`Failed to merge summaries: ${error}`);
      return summaries.join("\n\n");
    }
  }

  private estimateTokens(messages: ChatMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.name.length + tc.function.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }
}

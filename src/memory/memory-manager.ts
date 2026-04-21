import type { MemoryMessage } from "./short-term.js";
import type { MemorySearchResult } from "./long-term.js";
import { InMemoryMemory } from "./short-term.js";
import { LongTermMemory } from "./long-term.js";
import { extractTextContent } from "../ai/types.js";
import { logger } from "../utils/logger.js";

export interface MemoryManagerConfig {
  dataDir: string;
  shortTermMaxMessages: number;
  shortTermMaxTokens: number;
  longTermMaxEntries: number;
  autoStoreThreshold: number;
}

const DEFAULT_MEMORY_CONFIG: MemoryManagerConfig = {
  dataDir: "",
  shortTermMaxMessages: 100,
  shortTermMaxTokens: 128000,
  longTermMaxEntries: 10000,
  autoStoreThreshold: 0.8,
};

export class MemoryManager {
  private shortTerm: InMemoryMemory;
  private longTerm!: LongTermMemory;
  private config: MemoryManagerConfig;

  constructor(config: Partial<MemoryManagerConfig> & { dataDir: string }) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.shortTerm = new InMemoryMemory({
      maxMessages: this.config.shortTermMaxMessages,
      maxTokens: this.config.shortTermMaxTokens,
    });
  }

  initialize(): void {
    this.longTerm = new LongTermMemory({
      dataDir: this.config.dataDir,
      maxEntries: this.config.longTermMaxEntries,
      embeddingDimension: 1536,
    });
    this.longTerm.initialize();
    logger.info("Memory manager initialized");
  }

  getShortTerm(): InMemoryMemory {
    return this.shortTerm;
  }

  getLongTerm(): LongTermMemory {
    return this.longTerm;
  }

  addMessage(role: "system" | "user" | "assistant" | "tool", content: string, metadata?: Record<string, unknown>): MemoryMessage {
    const message = this.shortTerm.addMessage({ role, content }, metadata);

    if (this.shortTerm.isNearLimit(this.config.autoStoreThreshold)) {
      this.autoStoreToLongTerm();
    }

    return message;
  }

  searchLongTerm(query: string, limit?: number): MemorySearchResult[] {
    return this.longTerm.search(query, { limit });
  }

  getContextMessages(maxTokens: number): import("../ai/types.js").ChatMessage[] {
    return this.shortTerm.getMessagesForContext(maxTokens);
  }

  getMemorySummary(): string {
    const recent = this.shortTerm.getMessages().slice(-5);
    const parts: string[] = [];

    if (recent.length > 0) {
      parts.push("Recent conversation:");
      for (const msg of recent) {
        const text = extractTextContent(msg.content);
        const preview = text.slice(0, 200);
        parts.push(`[${msg.role}]: ${preview}`);
      }
    }

    const longTermEntries = this.longTerm.getAll().slice(0, 10);
    if (longTermEntries.length > 0) {
      parts.push("\nLong-term memories:");
      for (const entry of longTermEntries) {
        const preview = entry.content.slice(0, 150);
        parts.push(`- ${preview}`);
      }
    }

    return parts.join("\n");
  }

  private autoStoreToLongTerm(): void {
    const messages = this.shortTerm.getMessages();
    if (messages.length < 3) return;

    const userMessages = messages.filter((m) => m.role === "user");
    const importantMessages = userMessages.filter(
      (m) => extractTextContent(m.content).length > 50,
    );

    for (const msg of importantMessages.slice(0, 3)) {
      const text = extractTextContent(msg.content);
      const existing = this.longTerm.search(text, { limit: 1 });
      if (existing.length > 0 && (existing[0]?.score ?? 0) > 5) continue;

      this.longTerm.store(text, {
        tags: ["auto", "conversation"],
        source: "auto_store",
        importance: 0.3,
      });
    }

    logger.debug("Auto-stored messages to long-term memory");
  }
}

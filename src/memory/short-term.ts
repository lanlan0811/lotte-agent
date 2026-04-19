import type { ChatMessage } from "../ai/types.js";

export interface MemoryMessage extends ChatMessage {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ShortTermMemoryConfig {
  maxMessages: number;
  maxTokens: number;
  tokenEstimateRatio: number;
}

const DEFAULT_STM_CONFIG: ShortTermMemoryConfig = {
  maxMessages: 100,
  maxTokens: 128000,
  tokenEstimateRatio: 4,
};

export class InMemoryMemory {
  private messages: MemoryMessage[] = [];
  private config: ShortTermMemoryConfig;
  private idCounter = 0;

  constructor(config?: Partial<ShortTermMemoryConfig>) {
    this.config = { ...DEFAULT_STM_CONFIG, ...config };
  }

  addMessage(message: ChatMessage, metadata?: Record<string, unknown>): MemoryMessage {
    const memoryMessage: MemoryMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
      metadata,
    };

    this.messages.push(memoryMessage);
    this.enforceLimits();

    return memoryMessage;
  }

  addMessages(messages: ChatMessage[]): MemoryMessage[] {
    return messages.map((msg) => this.addMessage(msg));
  }

  getMessages(): MemoryMessage[] {
    return [...this.messages];
  }

  getChatMessages(): ChatMessage[] {
    return this.messages.map(({ role, content, tool_calls, tool_call_id, name }) => {
      const result: ChatMessage = { role, content };
      if (tool_calls) result.tool_calls = tool_calls;
      if (tool_call_id) result.tool_call_id = tool_call_id;
      if (name) result.name = name;
      return result;
    });
  }

  getMessage(id: string): MemoryMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }

  getLastMessage(): MemoryMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  getMessagesSince(timestamp: number): MemoryMessage[] {
    return this.messages.filter((m) => m.timestamp >= timestamp);
  }

  getMessagesRange(startIndex: number, endIndex?: number): MemoryMessage[] {
    return this.messages.slice(startIndex, endIndex);
  }

  removeMessage(id: string): boolean {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index === -1) return false;
    this.messages.splice(index, 1);
    return true;
  }

  updateMessage(id: string, updates: Partial<ChatMessage>): MemoryMessage | undefined {
    const message = this.getMessage(id);
    if (!message) return undefined;
    Object.assign(message, updates);
    return message;
  }

  clear(): void {
    this.messages = [];
  }

  size(): number {
    return this.messages.length;
  }

  estimateTokens(): number {
    let totalChars = 0;
    for (const msg of this.messages) {
      totalChars += msg.content.length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.name.length + tc.function.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / this.config.tokenEstimateRatio);
  }

  getContextWindowUsage(): number {
    if (this.config.maxTokens === 0) return 0;
    return this.estimateTokens() / this.config.maxTokens;
  }

  isNearLimit(threshold = 0.8): boolean {
    return this.getContextWindowUsage() >= threshold;
  }

  getMessagesForContext(maxTokens: number): ChatMessage[] {
    const result: ChatMessage[] = [];
    let estimatedTokens = 0;

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (!msg) continue;
      const msgTokens = this.estimateMessageTokens(msg);

      if (estimatedTokens + msgTokens > maxTokens) {
        break;
      }

      result.unshift({
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
      });

      estimatedTokens += msgTokens;
    }

    return result;
  }

  getSummary(): {
    messageCount: number;
    estimatedTokens: number;
    contextWindowUsage: number;
    oldestTimestamp: number | undefined;
    newestTimestamp: number | undefined;
  } {
    return {
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTokens(),
      contextWindowUsage: this.getContextWindowUsage(),
      oldestTimestamp: this.messages[0]?.timestamp,
      newestTimestamp: this.messages[this.messages.length - 1]?.timestamp,
    };
  }

  private enforceLimits(): void {
    while (this.messages.length > this.config.maxMessages) {
      this.messages.shift();
    }

    while (this.estimateTokens() > this.config.maxTokens && this.messages.length > 1) {
      this.messages.shift();
    }
  }

  private estimateMessageTokens(msg: MemoryMessage): number {
    let chars = msg.content.length;
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        chars += tc.function.name.length + tc.function.arguments.length;
      }
    }
    return Math.ceil(chars / this.config.tokenEstimateRatio);
  }

  private generateId(): string {
    return `msg_${Date.now()}_${++this.idCounter}`;
  }
}

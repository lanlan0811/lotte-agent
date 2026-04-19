import crypto from "node:crypto";

export interface SessionConfig {
  id?: string;
  model?: string;
  systemPrompt?: string;
  maxTurns: number;
  maxTokens: number;
  temperature: number;
  toolsEnabled: string[];
  toolsDisabled: string[];
  metadata: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  status: "active" | "paused" | "completed" | "error";
  currentTurn: number;
  totalTokensUsed: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
}

export class Session {
  readonly id: string;
  readonly config: SessionConfig;
  readonly state: SessionState;
  private abortController: AbortController | null = null;

  constructor(config: Partial<SessionConfig> & { id?: string }) {
    this.id = config.id ?? this.generateId();
    this.config = {
      maxTurns: config.maxTurns ?? 25,
      maxTokens: config.maxTokens ?? 128000,
      temperature: config.temperature ?? 0.7,
      toolsEnabled: config.toolsEnabled ?? [],
      toolsDisabled: config.toolsDisabled ?? [],
      metadata: config.metadata ?? {},
      model: config.model,
      systemPrompt: config.systemPrompt,
    };
    this.state = {
      id: this.id,
      status: "active",
      currentTurn: 0,
      totalTokensUsed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
    };
  }

  isActive(): boolean {
    return this.state.status === "active";
  }

  isCompleted(): boolean {
    return this.state.status === "completed";
  }

  hasReachedMaxTurns(): boolean {
    return this.state.currentTurn >= this.config.maxTurns;
  }

  incrementTurn(): void {
    this.state.currentTurn++;
    this.state.updatedAt = Date.now();
    this.state.lastMessageAt = Date.now();
  }

  addTokensUsed(tokens: number): void {
    this.state.totalTokensUsed += tokens;
  }

  pause(): void {
    if (this.state.status === "active") {
      this.state.status = "paused";
      this.state.updatedAt = Date.now();
    }
  }

  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "active";
      this.state.updatedAt = Date.now();
    }
  }

  complete(): void {
    this.state.status = "completed";
    this.state.updatedAt = Date.now();
  }

  error(): void {
    this.state.status = "error";
    this.state.updatedAt = Date.now();
  }

  abort(): void {
    this.abortController?.abort();
    this.state.status = "completed";
    this.state.updatedAt = Date.now();
  }

  getAbortSignal(): AbortSignal {
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    return this.abortController.signal;
  }

  private generateId(): string {
    return `sess_${crypto.randomUUID().slice(0, 8)}`;
  }
}

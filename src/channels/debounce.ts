import { logger } from "../utils/logger.js";

const USER_DEBOUNCE_MS = 1500;
const SESSION_DEBOUNCE_MS = 3000;
const TYPING_INDICATOR_INTERVAL_MS = 3000;

interface DebounceState {
  userTimer: ReturnType<typeof setTimeout> | null;
  sessionTimer: ReturnType<typeof setTimeout> | null;
  pendingMessages: Array<{
    message: unknown;
    enqueuedAt: number;
  }>;
  lastUserActivity: number;
  lastSessionActivity: number;
  isProcessing: boolean;
  typingTimer: ReturnType<typeof setInterval> | null;
  isTyping: boolean;
}

export type FlushCallback = (messages: unknown[], sessionId: string, senderId: string) => Promise<void>;
export type TypingCallback = (sessionId: string, senderId: string) => Promise<void>;

export class DualLevelDebouncer {
  private states: Map<string, DebounceState> = new Map();
  private userDebounceMs: number;
  private sessionDebounceMs: number;
  private typingIntervalMs: number;
  private flushCallback: FlushCallback;
  private typingCallback: TypingCallback | null;

  constructor(options: {
    flushCallback: FlushCallback;
    typingCallback?: TypingCallback;
    userDebounceMs?: number;
    sessionDebounceMs?: number;
    typingIntervalMs?: number;
  }) {
    this.flushCallback = options.flushCallback;
    this.typingCallback = options.typingCallback ?? null;
    this.userDebounceMs = options.userDebounceMs ?? USER_DEBOUNCE_MS;
    this.sessionDebounceMs = options.sessionDebounceMs ?? SESSION_DEBOUNCE_MS;
    this.typingIntervalMs = options.typingIntervalMs ?? TYPING_INDICATOR_INTERVAL_MS;
  }

  push(sessionId: string, senderId: string, message: unknown): void {
    const key = `${sessionId}::${senderId}`;
    let state = this.states.get(key);

    if (!state) {
      state = this.createState();
      this.states.set(key, state);
    }

    state.pendingMessages.push({
      message,
      enqueuedAt: Date.now(),
    });
    state.lastUserActivity = Date.now();
    state.lastSessionActivity = Date.now();

    this.startTypingIndicator(key, sessionId, senderId);

    this.resetUserTimer(key, sessionId, senderId);
    this.resetSessionTimer(key, sessionId, senderId);
  }

  isProcessing(sessionId: string, senderId: string): boolean {
    const key = `${sessionId}::${senderId}`;
    return this.states.get(key)?.isProcessing ?? false;
  }

  getPendingCount(sessionId: string, senderId: string): number {
    const key = `${sessionId}::${senderId}`;
    return this.states.get(key)?.pendingMessages.length ?? 0;
  }

  forceFlush(sessionId: string, senderId: string): void {
    const key = `${sessionId}::${senderId}`;
    this.flush(key, sessionId, senderId);
  }

  cleanup(sessionId: string, senderId: string): void {
    const key = `${sessionId}::${senderId}`;
    const state = this.states.get(key);
    if (!state) return;

    if (state.userTimer) clearTimeout(state.userTimer);
    if (state.sessionTimer) clearTimeout(state.sessionTimer);
    if (state.typingTimer) clearInterval(state.typingTimer);

    this.states.delete(key);
  }

  cleanupAll(): void {
    for (const [_key, state] of this.states) {
      if (state.userTimer) clearTimeout(state.userTimer);
      if (state.sessionTimer) clearTimeout(state.sessionTimer);
      if (state.typingTimer) clearInterval(state.typingTimer);
    }
    this.states.clear();
  }

  getMetrics(): { activeSessions: number; totalPending: number } {
    let totalPending = 0;
    for (const state of this.states.values()) {
      totalPending += state.pendingMessages.length;
    }
    return { activeSessions: this.states.size, totalPending };
  }

  private createState(): DebounceState {
    return {
      userTimer: null,
      sessionTimer: null,
      pendingMessages: [],
      lastUserActivity: 0,
      lastSessionActivity: 0,
      isProcessing: false,
      typingTimer: null,
      isTyping: false,
    };
  }

  private resetUserTimer(key: string, sessionId: string, senderId: string): void {
    const state = this.states.get(key);
    if (!state) return;

    if (state.userTimer) {
      clearTimeout(state.userTimer);
    }

    state.userTimer = setTimeout(() => {
      state.userTimer = null;
      this.flush(key, sessionId, senderId);
    }, this.userDebounceMs);
  }

  private resetSessionTimer(key: string, sessionId: string, senderId: string): void {
    const state = this.states.get(key);
    if (!state) return;

    if (state.sessionTimer) {
      clearTimeout(state.sessionTimer);
    }

    state.sessionTimer = setTimeout(() => {
      state.sessionTimer = null;
      if (!state.isProcessing && state.pendingMessages.length > 0) {
        this.flush(key, sessionId, senderId);
      }
    }, this.sessionDebounceMs);
  }

  private async flush(key: string, sessionId: string, senderId: string): Promise<void> {
    const state = this.states.get(key);
    if (!state || state.isProcessing || state.pendingMessages.length === 0) return;

    const messages = state.pendingMessages.splice(0);
    state.isProcessing = true;

    this.stopTypingIndicator(key);

    try {
      await this.flushCallback(messages, sessionId, senderId);
    } catch (error) {
      logger.error(`Debounce flush error for ${key}: ${error}`);
    } finally {
      state.isProcessing = false;

      if (state.pendingMessages.length > 0) {
        this.resetUserTimer(key, sessionId, senderId);
      } else {
        this.cleanup(key, sessionId);
      }
    }
  }

  private startTypingIndicator(key: string, sessionId: string, senderId: string): void {
    if (!this.typingCallback) return;

    const state = this.states.get(key);
    if (!state || state.isTyping) return;

    state.isTyping = true;

    void this.typingCallback(sessionId, senderId);

    state.typingTimer = setInterval(() => {
      if (this.typingCallback) {
        void this.typingCallback(sessionId, senderId);
      }
    }, this.typingIntervalMs);
  }

  private stopTypingIndicator(key: string): void {
    const state = this.states.get(key);
    if (!state) return;

    if (state.typingTimer) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
    state.isTyping = false;
  }
}

import type { QueueKey } from "./types.js";
import { logger } from "../utils/logger.js";

export type ConsumerFn = (
  queue: AsyncIterable<unknown>,
  channelId: string,
  sessionId: string,
  priority: number,
) => Promise<void>;

interface QueueState {
  queue: Array<unknown>;
  consumerTask: Promise<void>;
  createdAt: number;
  lastActivity: number;
  processedCount: number;
  resolveWait: (() => void) | null;
}

const DEFAULT_QUEUE_MAXSIZE = 1000;
const DEFAULT_IDLE_TIMEOUT = 600_000;
const DEFAULT_CLEANUP_INTERVAL = 60_000;

export class UnifiedQueueManager {
  private _queues: Map<string, QueueState> = new Map();
  private _consumerFn: ConsumerFn;
  private _queueMaxsize: number;
  private _idleTimeout: number;
  private _cleanupInterval: number;
  private _running = false;
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    consumerFn: ConsumerFn;
    queueMaxsize?: number;
    idleTimeout?: number;
    cleanupInterval?: number;
  }) {
    this._consumerFn = options.consumerFn;
    this._queueMaxsize = options.queueMaxsize ?? DEFAULT_QUEUE_MAXSIZE;
    this._idleTimeout = options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    this._cleanupInterval = options.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL;
  }

  private makeKey(key: QueueKey): string {
    return `${key.channelId}::${key.sessionId}::${key.priority}`;
  }

  async enqueue(key: QueueKey, payload: unknown): Promise<void> {
    const k = this.makeKey(key);
    let state = this._queues.get(k);

    if (!state) {
      state = this._createQueue(key, k);
    }

    if (state.queue.length >= this._queueMaxsize) {
      logger.warn(`Queue full: ${k}, dropping oldest message`);
      state.queue.shift();
    }

    state.queue.push(payload);
    state.lastActivity = Date.now();

    if (state.resolveWait) {
      state.resolveWait();
      state.resolveWait = null;
    }
  }

  private _createQueue(key: QueueKey, k: string): QueueState {
    const state: QueueState = {
      queue: [],
      consumerTask: Promise.resolve(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      processedCount: 0,
      resolveWait: null,
    };

    const asyncQueue = this._createAsyncIterable(state);

    state.consumerTask = this._consumerFn(asyncQueue, key.channelId, key.sessionId, key.priority)
      .catch((err) => {
        logger.error(`Consumer failed for ${k}: ${err}`);
      })
      .finally(() => {
        this._queues.delete(k);
      });

    this._queues.set(k, state);
    logger.info(`Created queue: channel=${key.channelId} session=${key.sessionId} priority=${key.priority}`);
    return state;
  }

  private _createAsyncIterable(state: QueueState): AsyncIterable<unknown> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            while (true) {
              if (state.queue.length > 0) {
                const item = state.queue.shift()!;
                state.processedCount++;
                state.lastActivity = Date.now();
                return { value: item, done: false };
              }

              await new Promise<void>((resolve) => {
                state.resolveWait = resolve;
                setTimeout(resolve, 5000);
              });
            }
          },
          return() {
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  startCleanupLoop(): void {
    if (this._cleanupTimer) return;
    this._running = true;
    this._cleanupTimer = setInterval(() => this._cleanupIdleQueues(), this._cleanupInterval);
    logger.info("Queue cleanup loop started");
  }

  private _cleanupIdleQueues(): void {
    const now = Date.now();
    const toCleanup: string[] = [];

    for (const [k, state] of this._queues) {
      if (state.queue.length === 0 && now - state.lastActivity > this._idleTimeout) {
        toCleanup.push(k);
      }
    }

    for (const k of toCleanup) {
      this._queues.delete(k);
      logger.info(`Cleaned up idle queue: ${k}`);
    }
  }

  async stopAll(): Promise<void> {
    this._running = false;
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._queues.clear();
    logger.info("All queues stopped");
  }

  getMetrics(): { totalQueues: number; queues: Array<Record<string, unknown>> } {
    const now = Date.now();
    const queues: Array<Record<string, unknown>> = [];
    for (const [k, state] of this._queues) {
      const [channelId, sessionId, priority] = k.split("::");
      queues.push({
        channelId,
        sessionId,
        priority: Number(priority),
        queueSize: state.queue.length,
        processedCount: state.processedCount,
        ageSeconds: (now - state.createdAt) / 1000,
        idleSeconds: (now - state.lastActivity) / 1000,
      });
    }
    return { totalQueues: queues.length, queues };
  }
}

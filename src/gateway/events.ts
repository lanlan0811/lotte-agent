import { logger } from "../utils/logger.js";

export type EventHandler = (payload: unknown) => void;

export interface EventSubscription {
  event: string;
  handler: EventHandler;
}

export class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private seq = 0;

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload: unknown): void {
    this.seq++;
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        logger.error(`Event handler error for "${event}": ${error}`);
      }
    }
  }

  getSeq(): number {
    return this.seq;
  }

  getRegisteredEvents(): string[] {
    return Array.from(this.handlers.keys());
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

export type { EventEmitter as GatewayEventEmitter };

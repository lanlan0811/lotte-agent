import type { Event, EventName, EventHandler, EventPayload } from "./types.js";
import { logger } from "../utils/logger.js";

type ListenerEntry = {
  id: string;
  handler: EventHandler;
  once: boolean;
};

export class EventBus {
  private listeners: Map<EventName, ListenerEntry[]> = new Map();
  private wildcardListeners: ListenerEntry[] = [];
  private listenerCounter = 0;
  private eventHistory: Event[] = [];
  private maxHistorySize: number;
  private historyEnabled: boolean;

  constructor(options?: { maxHistorySize?: number; historyEnabled?: boolean }) {
    this.maxHistorySize = options?.maxHistorySize ?? 1000;
    this.historyEnabled = options?.historyEnabled ?? true;
  }

  on(eventName: EventName, handler: EventHandler): string {
    const id = `listener_${++this.listenerCounter}`;
    const entry: ListenerEntry = { id, handler, once: false };

    if (eventName === "*") {
      this.wildcardListeners.push(entry);
    } else {
      const list = this.listeners.get(eventName) ?? [];
      list.push(entry);
      this.listeners.set(eventName, list);
    }

    return id;
  }

  once(eventName: EventName, handler: EventHandler): string {
    const id = `listener_${++this.listenerCounter}`;
    const entry: ListenerEntry = { id, handler, once: true };

    if (eventName === "*") {
      this.wildcardListeners.push(entry);
    } else {
      const list = this.listeners.get(eventName) ?? [];
      list.push(entry);
      this.listeners.set(eventName, list);
    }

    return id;
  }

  off(listenerId: string): boolean {
    for (const [name, list] of this.listeners) {
      const idx = list.findIndex((e) => e.id === listenerId);
      if (idx !== -1) {
        list.splice(idx, 1);
        if (list.length === 0) this.listeners.delete(name);
        return true;
      }
    }

    const wIdx = this.wildcardListeners.findIndex((e) => e.id === listenerId);
    if (wIdx !== -1) {
      this.wildcardListeners.splice(wIdx, 1);
      return true;
    }

    return false;
  }

  async emit(eventName: EventName, payload: EventPayload, source = "system"): Promise<void> {
    const event: Event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: eventName,
      payload,
      timestamp: Date.now(),
      source,
    };

    if (this.historyEnabled) {
      this.eventHistory.push(event);
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.shift();
      }
    }

    const entries = this.listeners.get(eventName) ?? [];
    const toRemove: string[] = [];

    const allHandlers = [
      ...entries.map((e) => ({ ...e, wildcard: false })),
      ...this.wildcardListeners.map((e) => ({ ...e, wildcard: true })),
    ];

    for (const entry of allHandlers) {
      try {
        await entry.handler(event);
      } catch (error) {
        logger.error(`Event handler error for "${eventName}" (${entry.id}): ${error}`);
      }

      if (entry.once && !entry.wildcard) {
        toRemove.push(entry.id);
      }
    }

    if (toRemove.length > 0) {
      const remaining = entries.filter((e) => !toRemove.includes(e.id));
      if (remaining.length > 0) {
        this.listeners.set(eventName, remaining);
      } else {
        this.listeners.delete(eventName);
      }
    }

    for (const entry of this.wildcardListeners) {
      if (entry.once) {
        this.wildcardListeners = this.wildcardListeners.filter((e) => e.id !== entry.id);
      }
    }
  }

  getHistory(eventName?: EventName, limit = 50): Event[] {
    let events = this.eventHistory;
    if (eventName) {
      events = events.filter((e) => e.name === eventName);
    }
    return events.slice(-limit);
  }

  getListenerCount(eventName?: EventName): number {
    if (!eventName) {
      let total = this.wildcardListeners.length;
      for (const list of this.listeners.values()) {
        total += list.length;
      }
      return total;
    }
    return (this.listeners.get(eventName)?.length ?? 0) + this.wildcardListeners.length;
  }

  removeAllListeners(eventName?: EventName): void {
    if (!eventName) {
      this.listeners.clear();
      this.wildcardListeners = [];
    } else {
      this.listeners.delete(eventName);
    }
  }

  clearHistory(): void {
    this.eventHistory = [];
  }
}

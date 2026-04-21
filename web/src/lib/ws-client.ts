const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || "ws://127.0.0.1:10623";

export type WsEventType =
  | "chat.chunk"
  | "chat.done"
  | "chat.error"
  | "tool.call"
  | "tool.result"
  | "approval.request"
  | "approval.resolved"
  | "channel.message"
  | "channel.status"
  | "cron.job_started"
  | "cron.job_completed"
  | "cron.job_failed"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "system.started"
  | "system.stopped"
  | string;

export interface WsEvent {
  type: WsEventType;
  data: Record<string, unknown>;
  timestamp?: number;
}

export type WsEventHandler = (event: WsEvent) => void;
export type WsStatusHandler = (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<WsEventType | "*", Set<WsEventHandler>> = new Map();
  private statusListeners: Set<WsStatusHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private messageQueue: string[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval = 30000;
  private lastPongTime = 0;
  private missedHeartbeats = 0;
  private maxMissedHeartbeats = 3;
  private _status: "connecting" | "connected" | "disconnected" | "reconnecting" = "disconnected";

  constructor(url?: string) {
    this.url = url || `${WS_BASE}/ws`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.missedHeartbeats = 0;
        this.startHeartbeat();
        this.flushQueue();
        this.setStatus("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = event.data as string;

          if (data === "pong") {
            this.lastPongTime = Date.now();
            this.missedHeartbeats = 0;
            return;
          }

          const parsed = JSON.parse(data) as WsEvent;
          this.dispatch(parsed);
        } catch {}
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.setStatus("disconnected");

        if (!this.intentionalClose && event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "Client disconnect");
    this.ws = null;
    this.setStatus("disconnected");
  }

  send(data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.messageQueue.push(payload);
    }
  }

  on(eventType: WsEventType | "*", handler: WsEventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }

  off(eventType: WsEventType | "*", handler: WsEventHandler): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  onStatus(handler: WsStatusHandler): () => void {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get status(): "connecting" | "connected" | "disconnected" | "reconnecting" {
    return this._status;
  }

  private setStatus(status: "connecting" | "connected" | "disconnected" | "reconnecting"): void {
    this._status = status;
    for (const handler of this.statusListeners) {
      try {
        handler(status);
      } catch {}
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.missedHeartbeats++;
        if (this.missedHeartbeats > this.maxMissedHeartbeats) {
          this.ws.close(4000, "Heartbeat timeout");
          return;
        }
        this.ws.send("ping");
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private dispatch(event: WsEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {}
      }
    }
    const wildcardHandlers = this.listeners.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch {}
      }
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(msg);
      } else {
        this.messageQueue.unshift(msg);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("reconnecting");
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export const wsClient = new WebSocketClient();

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || "ws://127.0.0.1:10623";
const AUTH_STORAGE_KEY = "lotte_ws_auth";

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
export type WsStatusHandler = (status: "connecting" | "connected" | "disconnected" | "reconnecting" | "authenticating") => void;

interface GatewayFrame {
  type: "req" | "res" | "event";
  id?: string;
  method?: string;
  params?: unknown;
  ok?: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
  event?: string;
  seq?: number;
}

interface ChallengeFrame {
  type: "challenge";
  protocol: number;
  nonce: string;
  methods: string[];
  timeoutMs: number;
}

interface HelloOkFrame {
  type: "hello-ok";
  protocol: number;
  server: { version: string; connId: string };
  features: Record<string, unknown>;
  policy: Record<string, unknown>;
}

interface AuthCredentials {
  mode: "token" | "password" | "none";
  token?: string;
  password?: string;
}

function loadCredentials(): AuthCredentials {
  if (typeof window === "undefined") return { mode: "none" };
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AuthCredentials;
  } catch {}
  return { mode: "none" };
}

function saveCredentials(creds: AuthCredentials): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(creds));
  } catch {}
}

async function computeHmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  private _status: "connecting" | "connected" | "disconnected" | "reconnecting" | "authenticating" = "disconnected";
  private handshakeComplete = false;
  private pendingChallenge: ChallengeFrame | null = null;
  private requestId = 0;
  private connId: string | null = null;

  constructor(url?: string) {
    this.url = url || `${WS_BASE}/ws`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    this.handshakeComplete = false;
    this.pendingChallenge = null;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.missedHeartbeats = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = event.data as string;

          if (data === "pong") {
            this.lastPongTime = Date.now();
            this.missedHeartbeats = 0;
            return;
          }

          const frame = JSON.parse(data) as GatewayFrame;
          this.handleFrame(frame);
        } catch {}
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.handshakeComplete = false;
        this.pendingChallenge = null;
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
    this.handshakeComplete = false;
    this.pendingChallenge = null;
    this.setStatus("disconnected");
  }

  setCredentials(mode: "token" | "password" | "none", secret?: string): void {
    const creds: AuthCredentials = { mode };
    if (mode === "token" && secret) creds.token = secret;
    if (mode === "password" && secret) creds.password = secret;
    saveCredentials(creds);
  }

  getCredentials(): AuthCredentials {
    return loadCredentials();
  }

  clearCredentials(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  send(data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete) {
      this.ws.send(payload);
    } else {
      this.messageQueue.push(payload);
    }
  }

  sendRequest(method: string, params?: unknown): string {
    const id = `req_${++this.requestId}`;
    const frame: GatewayFrame = { type: "req", id, method, params };
    this.send(frame);
    return id;
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
    return this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete;
  }

  get status(): "connecting" | "connected" | "disconnected" | "reconnecting" | "authenticating" {
    return this._status;
  }

  get isAuthenticated(): boolean {
    return this.handshakeComplete;
  }

  getConnId(): string | null {
    return this.connId;
  }

  private setStatus(status: "connecting" | "connected" | "disconnected" | "reconnecting" | "authenticating"): void {
    this._status = status;
    for (const handler of this.statusListeners) {
      try {
        handler(status);
      } catch {}
    }
  }

  private handleFrame(frame: GatewayFrame): void {
    if (frame.type === "res" && frame.payload) {
      const payload = frame.payload as Record<string, unknown>;

      if (payload.type === "challenge") {
        this.handleChallenge(payload as unknown as ChallengeFrame);
        return;
      }

      if (payload.type === "hello-ok") {
        this.handleHelloOk(payload as unknown as HelloOkFrame);
        return;
      }
    }

    if (frame.type === "res" && !frame.ok && frame.error) {
      if (frame.error.code === "AUTH_REQUIRED" || frame.error.code === "AUTH_FAILED") {
        this.handshakeComplete = false;
        this.setStatus("authenticating");
        return;
      }
    }

    if (frame.type === "event" && frame.event) {
      const wsEvent: WsEvent = {
        type: frame.event as WsEventType,
        data: (frame.payload as Record<string, unknown>) ?? {},
        timestamp: Date.now(),
      };
      this.dispatch(wsEvent);
    }
  }

  private async handleChallenge(challenge: ChallengeFrame): Promise<void> {
    this.pendingChallenge = challenge;
    this.setStatus("authenticating");

    const creds = loadCredentials();

    if (creds.mode === "none") {
      this.sendConnectRequest(undefined, undefined);
      return;
    }

    const secret = creds.mode === "token" ? creds.token : creds.password;
    if (!secret) {
      this.sendConnectRequest(undefined, undefined);
      return;
    }

    try {
      const challengeResponse = await computeHmacSha256(secret, challenge.nonce);
      const method = creds.mode === "token" ? "hmac-token" : "hmac-password";
      this.sendConnectRequest(
        { challengeResponse, method },
        { id: "web-client", version: "0.1.0", platform: "web", mode: "default" },
      );
    } catch {
      this.sendConnectRequest(
        { [creds.mode]: secret },
        { id: "web-client", version: "0.1.0", platform: "web", mode: "default" },
      );
    }
  }

  private handleHelloOk(hello: HelloOkFrame): void {
    this.handshakeComplete = true;
    this.connId = hello.server.connId;
    this.startHeartbeat();
    this.flushQueue();
    this.setStatus("connected");
  }

  private sendConnectRequest(
    auth?: { challengeResponse?: string; method?: string; token?: string; password?: string },
    client?: { id: string; version: string; platform: string; mode: string },
  ): void {
    const id = `req_${++this.requestId}`;
    const params: Record<string, unknown> = {};

    if (auth) {
      params.auth = auth;
    }
    if (client) {
      params.client = client;
    }

    const frame: GatewayFrame = { type: "req", id, method: "connect", params };
    const payload = JSON.stringify(frame);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
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

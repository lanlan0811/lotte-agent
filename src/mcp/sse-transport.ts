import { EventEmitter } from "node:events";
import type { MCPClientConfig } from "../config/schema.js";
import { MCPTransport } from "./types.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

const JSONRPC_VERSION = "2.0";

interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return "id" in msg && ("result" in msg || "error" in msg);
}

function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !("id" in msg) || ("method" in msg && !("result" in msg) && !("error" in msg));
}

export interface SSETransportEvents {
  connected: () => void;
  disconnected: (error?: Error) => void;
  reconnecting: (attempt: number) => void;
  notification: (method: string, params?: Record<string, unknown>) => void;
}

const DEFAULT_CONNECT_TIMEOUT = 10_000;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL = 30_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 30_000;

export class SSETransportEnhanced extends MCPTransport {
  private messageEmitter = new EventEmitter();
  private requestId = 0;
  private pendingRequests: Map<number | string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private _isConnected = false;
  private eventSource: EventSource | null = null;
  private messageEndpoint: string | null = null;
  private sessionId: string | null = null;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private intentionallyClosed = false;

  private readonly connectTimeout: number;
  private readonly requestTimeout: number;
  private readonly heartbeatInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelay: number;
  private readonly reconnectMaxDelay: number;

  private eventHandlers: {
    connected?: () => void;
    disconnected?: (error?: Error) => void;
    reconnecting?: (attempt: number) => void;
    notification?: (method: string, params?: Record<string, unknown>) => void;
  } = {};

  constructor(config: MCPClientConfig, opts?: {
    connectTimeout?: number;
    requestTimeout?: number;
    heartbeatInterval?: number;
    maxReconnectAttempts?: number;
    reconnectBaseDelay?: number;
    reconnectMaxDelay?: number;
  }) {
    super(config);
    this.connectTimeout = opts?.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
    this.requestTimeout = opts?.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    this.heartbeatInterval = opts?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
    this.maxReconnectAttempts = opts?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.reconnectBaseDelay = opts?.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY;
    this.reconnectMaxDelay = opts?.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY;
  }

  override get isConnected(): boolean {
    return this._isConnected;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setEventHandlers(handlers: SSETransportEvents): void {
    this.eventHandlers = handlers as typeof this.eventHandlers;
  }

  override async connect(): Promise<void> {
    if (this._isConnected) return;

    const url = this.config.url;
    if (!url) {
      throw new Error("sse transport requires a url");
    }

    this.intentionallyClosed = false;
    await this.initSseConnection();

    this._isConnected = true;
    this.reconnectAttempts = 0;
    this.lastMessageAt = Date.now();
    this.startHeartbeat();

    logger.info(`[MCP sse] Connected: ${this.config.name} (${url})`);
    this.eventHandlers.connected?.();
  }

  override async close(): Promise<void> {
    this.intentionallyClosed = true;
    this._isConnected = false;

    this.stopHeartbeat();
    this.cancelReconnect();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Transport closed"));
    }
    this.pendingRequests.clear();

    this.messageEndpoint = null;
    this.sessionId = null;

    logger.debug(`[MCP sse] Closed: ${this.config.name}`);
  }

  override async send(message: unknown): Promise<void> {
    if (!this._isConnected || !this.messageEndpoint) {
      throw new Error("Transport not connected or no message endpoint");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    for (const [key, value] of Object.entries(this.config.headers)) {
      headers[key] = String(value);
    }

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    const sessionIdHeader = response.headers.get("Mcp-Session-Id");
    if (sessionIdHeader) {
      this.sessionId = sessionIdHeader;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  }

  override onMessage(handler: (message: unknown) => void): void {
    this.messageEmitter.on("message", handler);
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id})`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });

      this.send(request).catch((error) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private initSseConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.config.url!;

      this.eventSource = new EventSource(url);

      const timeout = setTimeout(() => {
        this.eventSource?.close();
        reject(new Error("SSE connection timeout"));
      }, this.connectTimeout);

      this.eventSource.addEventListener("endpoint", (event) => {
        clearTimeout(timeout);
        const endpointPath = (event as MessageEvent).data;
        if (endpointPath) {
          try {
            const base = new URL(url);
            this.messageEndpoint = new URL(endpointPath, base).href;
          } catch {
            logger.debug(`[MCP sse:${this.config.name}] Failed to resolve message endpoint URL`);
            this.messageEndpoint = endpointPath;
          }
        }
        resolve();
      });

      this.eventSource.addEventListener("message", (event) => {
        this.lastMessageAt = Date.now();
        try {
          const message: JsonRpcMessage = JSON.parse((event as MessageEvent).data);
          this.handleMessage(message);
        } catch {
          logger.debug(`[MCP sse:${this.config.name}] Failed to parse SSE message`);
        }
      });

      this.eventSource.onerror = () => {
        clearTimeout(timeout);
        if (!this._isConnected) {
          reject(new Error("SSE connection failed"));
        } else {
          this.handleConnectionLoss();
        }
        this.eventSource?.close();
      };
    });
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (isResponse(message)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (isNotification(message)) {
      this.messageEmitter.emit("message", message);
      this.eventHandlers.notification?.(message.method, message.params);
    } else {
      this.messageEmitter.emit("message", message);
    }
  }

  private handleConnectionLoss(): void {
    if (this.intentionallyClosed) return;

    this._isConnected = false;
    this.stopHeartbeat();

    const error = new Error("SSE connection lost");
    logger.warn(`[MCP sse:${this.config.name}] ${error.message}`);
    this.eventHandlers.disconnected?.(error);

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Connection lost"));
    }
    this.pendingRequests.clear();

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[MCP sse:${this.config.name}] Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      this.eventHandlers.disconnected?.(new Error("Max reconnect attempts reached"));
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = this.reconnectBaseDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6));
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(baseDelay + jitter, this.reconnectMaxDelay);

    logger.info(`[MCP sse:${this.config.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.eventHandlers.reconnecting?.(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }

        await this.initSseConnection();

        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.startHeartbeat();

        logger.info(`[MCP sse:${this.config.name}] Reconnected successfully`);
        this.eventHandlers.connected?.();
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.debug(`[MCP sse:${this.config.name}] Reconnect failed: ${msg}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this._isConnected) return;

      const elapsed = Date.now() - this.lastMessageAt;
      if (elapsed > this.heartbeatInterval * 2) {
        logger.warn(`[MCP sse:${this.config.name}] No messages received for ${elapsed}ms, connection may be stale`);
        this.handleConnectionLoss();
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

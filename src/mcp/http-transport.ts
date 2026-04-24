import { EventEmitter } from "node:events";
import type { MCPClientConfig } from "../config/schema.js";
import { MCPTransport } from "./types.js";
import { logger } from "../utils/logger.js";

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

export class StreamableHttpTransport extends MCPTransport {
  private messageEmitter = new EventEmitter();
  private requestId = 0;
  private pendingRequests: Map<number | string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private _isConnected = false;
  private eventSource: EventSource | null = null;
  private sessionId: string | null = null;

  constructor(config: MCPClientConfig) {
    super(config);
  }

  override get isConnected(): boolean {
    return this._isConnected;
  }

  override async connect(): Promise<void> {
    if (this._isConnected) return;

    const url = this.config.url;
    if (!url) {
      throw new Error("streamable_http transport requires a url");
    }

    this._isConnected = true;
    logger.info(`[MCP streamable_http] Connected: ${this.config.name} (${url})`);
  }

  override async close(): Promise<void> {
    this._isConnected = false;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Transport closed"));
    }
    this.pendingRequests.clear();

    this.sessionId = null;
  }

  override async send(message: unknown): Promise<void> {
    if (!this._isConnected) {
      throw new Error("Transport not connected");
    }

    const url = this.config.url;
    if (!url) throw new Error("No URL configured");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    for (const [key, value] of Object.entries(this.config.headers)) {
      headers[key] = String(value);
    }

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(url, {
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

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      this.handleSseResponse(response);
    } else if (contentType.includes("application/json")) {
      const data = await response.json() as JsonRpcMessage;
      this.handleMessage(data);
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
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id})`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send(request).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private async handleSseResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentData = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            currentData += line.slice(6);
          } else if (line === "" && currentData) {
            try {
              const message: JsonRpcMessage = JSON.parse(currentData);
              this.handleMessage(message);
            } catch {
              logger.debug(`[MCP http:${this.config.name}] Failed to parse SSE data`);
            }
            currentData = "";
          }
        }
      }
    } catch (error) {
      if (this._isConnected) {
        logger.debug(`[MCP http:${this.config.name}] SSE read error: ${error}`);
      }
    }
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
    } else {
      this.messageEmitter.emit("message", message);
    }
  }
}

export class SseTransport extends MCPTransport {
  private messageEmitter = new EventEmitter();
  private requestId = 0;
  private pendingRequests: Map<number | string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private _isConnected = false;
  private eventSource: EventSource | null = null;
  private messageEndpoint: string | null = null;

  constructor(config: MCPClientConfig) {
    super(config);
  }

  override get isConnected(): boolean {
    return this._isConnected;
  }

  override async connect(): Promise<void> {
    if (this._isConnected) return;

    const url = this.config.url;
    if (!url) {
      throw new Error("sse transport requires a url");
    }

    await this.initSseConnection();

    this._isConnected = true;
    logger.info(`[MCP sse] Connected: ${this.config.name} (${url})`);
  }

  override async close(): Promise<void> {
    this._isConnected = false;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Transport closed"));
    }
    this.pendingRequests.clear();

    this.messageEndpoint = null;
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

    const response = await fetch(this.messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

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
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id})`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send(request).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private initSseConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.config.url!;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(this.config.headers)) {
        headers[key] = String(value);
      }

      this.eventSource = new EventSource(url);

      const timeout = setTimeout(() => {
        reject(new Error("SSE connection timeout"));
        this.eventSource?.close();
      }, 10000);

      this.eventSource.addEventListener("endpoint", (event) => {
        clearTimeout(timeout);
        const endpointPath = (event as MessageEvent).data;
        if (endpointPath) {
          try {
            const base = new URL(url);
            this.messageEndpoint = new URL(endpointPath, base).href;
          } catch (e) {
            logger.debug(`[MCP http:${this.config.name}] Failed to resolve endpoint URL: ${e}`);
            this.messageEndpoint = endpointPath;
          }
        }
        resolve();
      });

      this.eventSource.addEventListener("message", (event) => {
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
    } else {
      this.messageEmitter.emit("message", message);
    }
  }
}

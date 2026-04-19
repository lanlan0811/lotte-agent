import { spawn, type ChildProcess } from "node:child_process";
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

export class StdioTransport extends MCPTransport {
  private process: ChildProcess | null = null;
  private messageEmitter = new EventEmitter();
  private requestId = 0;
  private pendingRequests: Map<number | string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private buffer = "";
  private _isConnected = false;

  constructor(config: MCPClientConfig) {
    super(config);
  }

  override get isConnected(): boolean {
    return this._isConnected && this.process !== null && !this.process.killed;
  }

  override async connect(): Promise<void> {
    if (this._isConnected) return;

    const command = this.config.command;
    if (!command) {
      throw new Error("stdio transport requires a command");
    }

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    for (const [key, value] of Object.entries(this.config.env)) {
      env[key] = String(value);
    }

    this.process = spawn(command, this.config.args, {
      cwd: this.config.cwd || undefined,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleData(data.toString("utf-8"));
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8").trim();
      if (text) {
        logger.debug(`[MCP stdio:${this.config.name}] stderr: ${text}`);
      }
    });

    this.process.on("error", (error) => {
      logger.error(`[MCP stdio:${this.config.name}] process error: ${error.message}`);
      this._isConnected = false;
      this.rejectAllPending(new Error(`Process error: ${error.message}`));
    });

    this.process.on("exit", (code, signal) => {
      logger.debug(`[MCP stdio:${this.config.name}] process exited (code=${code}, signal=${signal})`);
      this._isConnected = false;
      this.rejectAllPending(new Error(`Process exited with code ${code}`));
    });

    this._isConnected = true;
    logger.info(`[MCP stdio] Connected: ${this.config.name} (${command} ${this.config.args.join(" ")})`);
  }

  override async close(): Promise<void> {
    if (!this.process) return;

    this._isConnected = false;
    this.rejectAllPending(new Error("Transport closed"));

    try {
      this.process.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.process?.kill("SIGKILL");
          resolve();
        }, 5000);
        this.process?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch {
      this.process.kill("SIGKILL");
    }

    this.process = null;
  }

  override async send(message: unknown): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    const json = JSON.stringify(message);
    const frame = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

    return new Promise<void>((resolve, reject) => {
      this.process!.stdin!.write(frame, (error) => {
        if (error) {
          reject(new Error(`Failed to send message: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
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

  private handleData(data: string): void {
    this.buffer += data;

    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1] ?? "0", 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const messageStr = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message: JsonRpcMessage = JSON.parse(messageStr);
        this.handleMessage(message);
      } catch {
        logger.debug(`[MCP stdio:${this.config.name}] Failed to parse message`);
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

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

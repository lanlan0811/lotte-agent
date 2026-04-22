import { EventEmitter } from "node:events";
import type { MCPClientConfig } from "../config/schema.js";
import {
  MCPStatefulClient,
  type MCPTool,
  type MCPResource,
  type MCPPrompt,
  type MCPCapabilities,
  type MCPToolCallResult,
  type MCPResourceContent,
  type MCPPromptMessage,
  type MCPInitializeResult,
} from "./types.js";
import { StdioTransport } from "./stdio-transport.js";
import { StreamableHttpTransport } from "./http-transport.js";
import { SSETransportEnhanced } from "./sse-transport.js";
import { logger } from "../utils/logger.js";

export interface ClientSession {
  sessionId: string | null;
  connectedAt: number;
  lastActivityAt: number;
  requestCount: number;
  errorCount: number;
}

export interface ClientNotification {
  method: string;
  params?: Record<string, unknown>;
  receivedAt: number;
}

export type StatefulClientEventType =
  | "connected"
  | "disconnected"
  | "tools_changed"
  | "resources_changed"
  | "prompts_changed"
  | "notification"
  | "error";

interface TransportWrapper {
  sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown>;
  connect(): Promise<void>;
  close(): Promise<void>;
  get isConnected(): boolean;
}

export class EnhancedStatefulClient extends MCPStatefulClient {
  private config: MCPClientConfig;
  private transportImpl: TransportWrapper;
  private _capabilities: MCPCapabilities | null = null;
  private _serverInfo: { name: string; version: string } | null = null;
  private _isConnected = false;
  private _tools: MCPTool[] = [];
  private _resources: MCPResource[] = [];
  private _prompts: MCPPrompt[] = [];
  private _session: ClientSession | null = null;
  private eventEmitter = new EventEmitter();
  private notificationBuffer: ClientNotification[] = [];
  private readonly maxNotificationBuffer = 100;

  constructor(config: MCPClientConfig) {
    super();
    this.config = config;
    this.transportImpl = this.createTransport(config);
  }

  override get name(): string {
    return this.config.name;
  }

  override get transport(): string {
    return this.config.transport;
  }

  override get capabilities(): MCPCapabilities | null {
    return this._capabilities;
  }

  override get isConnected(): boolean {
    return this._isConnected && this.transportImpl.isConnected;
  }

  get session(): ClientSession | null {
    return this._session ? { ...this._session } : null;
  }

  get recentNotifications(): ClientNotification[] {
    return [...this.notificationBuffer];
  }

  on(event: StatefulClientEventType, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: StatefulClientEventType, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  override async connect(): Promise<void> {
    if (this._isConnected) return;

    await this.transportImpl.connect();

    try {
      const result = await this.transportImpl.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "lotte-agent",
          version: "0.1.0",
        },
      }) as MCPInitializeResult;

      this._capabilities = result.capabilities;
      this._serverInfo = result.serverInfo;

      await this.transportImpl.sendRequest("notifications/initialized");

      this._session = {
        sessionId: this.extractSessionId(),
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
        requestCount: 0,
        errorCount: 0,
      };

      if (this._capabilities?.tools) {
        await this.refreshTools();
      }
      if (this._capabilities?.resources) {
        await this.refreshResources();
      }
      if (this._capabilities?.prompts) {
        await this.refreshPrompts();
      }

      this.setupNotificationHandlers();

      this._isConnected = true;
      logger.info(`MCP client connected: ${this.config.name} (server: ${this._serverInfo?.name} v${this._serverInfo?.version})`);
      this.eventEmitter.emit("connected");
    } catch (error) {
      this._session = null;
      await this.forceClose();
      this.eventEmitter.emit("error", error);
      throw error;
    }
  }

  override async close(): Promise<void> {
    if (!this._isConnected && !this.transportImpl.isConnected) return;

    const wasConnected = this._isConnected;
    this._isConnected = false;
    this._capabilities = null;
    this._serverInfo = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];
    this._session = null;
    this.notificationBuffer = [];

    await this.transportImpl.close();
    logger.info(`MCP client disconnected: ${this.config.name}`);

    if (wasConnected) {
      this.eventEmitter.emit("disconnected");
    }
  }

  override async listTools(): Promise<MCPTool[]> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    if (this._tools.length > 0) {
      return this._tools;
    }

    await this.refreshTools();
    return this._tools;
  }

  override async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    this.updateSessionActivity();

    try {
      const result = await this.transportImpl.sendRequest("tools/call", {
        name,
        arguments: args,
      }) as MCPToolCallResult;

      this._session!.requestCount++;
      return result;
    } catch (error) {
      if (this._session) {
        this._session.errorCount++;
      }
      this.eventEmitter.emit("error", error);
      throw error;
    }
  }

  override async listResources(): Promise<MCPResource[]> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    if (this._resources.length > 0) {
      return this._resources;
    }

    await this.refreshResources();
    return this._resources;
  }

  override async readResource(uri: string): Promise<MCPResourceContent[]> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    this.updateSessionActivity();

    const result = await this.transportImpl.sendRequest("resources/read", { uri }) as {
      contents: MCPResourceContent[];
    };

    this._session!.requestCount++;
    return result.contents;
  }

  override async listPrompts(): Promise<MCPPrompt[]> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    if (this._prompts.length > 0) {
      return this._prompts;
    }

    await this.refreshPrompts();
    return this._prompts;
  }

  override async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]> {
    if (!this._isConnected) {
      throw new Error(`MCP client not connected: ${this.config.name}`);
    }

    this.updateSessionActivity();

    const result = await this.transportImpl.sendRequest("prompts/get", {
      name,
      arguments: args,
    }) as {
      description?: string;
      messages: MCPPromptMessage[];
    };

    this._session!.requestCount++;
    return result.messages;
  }

  async refreshTools(): Promise<void> {
    try {
      const result = await this.transportImpl.sendRequest("tools/list") as {
        tools: MCPTool[];
      };
      const oldTools = this._tools;
      this._tools = result.tools || [];

      if (oldTools.length > 0 && this.toolsChanged(oldTools, this._tools)) {
        logger.debug(`MCP client ${this.config.name}: tools list changed (${this._tools.length} tools)`);
        this.eventEmitter.emit("tools_changed", this._tools);
      }
    } catch (error) {
      logger.debug(`MCP client ${this.config.name}: failed to list tools: ${error}`);
      this._tools = [];
    }
  }

  async refreshResources(): Promise<void> {
    try {
      const result = await this.transportImpl.sendRequest("resources/list") as {
        resources: MCPResource[];
      };
      const oldResources = this._resources;
      this._resources = result.resources || [];

      if (oldResources.length > 0 && this.resourcesChanged(oldResources, this._resources)) {
        logger.debug(`MCP client ${this.config.name}: resources list changed (${this._resources.length} resources)`);
        this.eventEmitter.emit("resources_changed", this._resources);
      }
    } catch (error) {
      logger.debug(`MCP client ${this.config.name}: failed to list resources: ${error}`);
      this._resources = [];
    }
  }

  async refreshPrompts(): Promise<void> {
    try {
      const result = await this.transportImpl.sendRequest("prompts/list") as {
        prompts: MCPPrompt[];
      };
      const oldPrompts = this._prompts;
      this._prompts = result.prompts || [];

      if (oldPrompts.length > 0 && this.promptsChanged(oldPrompts, this._prompts)) {
        logger.debug(`MCP client ${this.config.name}: prompts list changed (${this._prompts.length} prompts)`);
        this.eventEmitter.emit("prompts_changed", this._prompts);
      }
    } catch (error) {
      logger.debug(`MCP client ${this.config.name}: failed to list prompts: ${error}`);
      this._prompts = [];
    }
  }

  override getToolsSnapshot(): MCPTool[] {
    return [...this._tools];
  }

  override getResourcesSnapshot(): MCPResource[] {
    return [...this._resources];
  }

  override getPromptsSnapshot(): MCPPrompt[] {
    return [...this._prompts];
  }

  override getConfig(): MCPClientConfig {
    return { ...this.config };
  }

  private createTransport(config: MCPClientConfig): TransportWrapper {
    switch (config.transport) {
      case "stdio":
        return new StdioTransport(config);
      case "streamable_http":
        return new StreamableHttpTransport(config);
      case "sse":
        return new SSETransportEnhanced(config);
      default:
        throw new Error(`Unknown MCP transport: ${config.transport}`);
    }
  }

  private setupNotificationHandlers(): void {
    if ("on" in this.transportImpl && typeof this.transportImpl.on === "function") {
      (this.transportImpl as unknown as { on: (event: string, handler: (msg: unknown) => void) => void }).on("message", (message: unknown) => {
        this.handleTransportNotification(message);
      });
    }

    if (this.transportImpl instanceof SSETransportEnhanced) {
      this.transportImpl.setEventHandlers({
        connected: () => {
          if (!this._isConnected) {
            this._isConnected = true;
            this.eventEmitter.emit("connected");
          }
        },
        disconnected: (error?: Error) => {
          if (this._isConnected) {
            this._isConnected = false;
            this.eventEmitter.emit("disconnected", error);
          }
        },
        reconnecting: (attempt: number) => {
          logger.debug(`MCP client ${this.config.name}: SSE reconnecting (attempt ${attempt})`);
        },
        notification: (method: string, params?: Record<string, unknown>) => {
          this.bufferNotification(method, params);
          this.handleServerNotification(method, params);
        },
      });
    }
  }

  private handleTransportNotification(message: unknown): void {
    if (!message || typeof message !== "object") return;

    const msg = message as Record<string, unknown>;
    if ("method" in msg && typeof msg.method === "string") {
      this.bufferNotification(msg.method, msg.params as Record<string, unknown> | undefined);
      this.handleServerNotification(msg.method, msg.params as Record<string, unknown> | undefined);
    }
  }

  private handleServerNotification(method: string, params?: Record<string, unknown>): void {
    switch (method) {
      case "notifications/tools/list_changed":
        if (this._capabilities?.tools?.listChanged) {
          this.refreshTools().catch((error) => {
            logger.debug(`MCP client ${this.config.name}: failed to refresh tools after notification: ${error}`);
          });
        }
        break;

      case "notifications/resources/list_changed":
        if (this._capabilities?.resources?.listChanged) {
          this.refreshResources().catch((error) => {
            logger.debug(`MCP client ${this.config.name}: failed to refresh resources after notification: ${error}`);
          });
        }
        break;

      case "notifications/prompts/list_changed":
        if (this._capabilities?.prompts?.listChanged) {
          this.refreshPrompts().catch((error) => {
            logger.debug(`MCP client ${this.config.name}: failed to refresh prompts after notification: ${error}`);
          });
        }
        break;

      case "notifications/resources/updated":
        logger.debug(`MCP client ${this.config.name}: resource updated: ${params?.uri}`);
        break;

      case "notifications/message":
        logger.debug(`MCP client ${this.config.name}: server message: ${params?.data}`);
        break;

      case "notifications/logging":
        this.handleLoggingNotification(params);
        break;

      default:
        logger.debug(`MCP client ${this.config.name}: unhandled notification: ${method}`);
    }

    this.eventEmitter.emit("notification", method, params);
  }

  private handleLoggingNotification(params?: Record<string, unknown>): void {
    if (!params) return;

    const level = params.level as string ?? "info";
    const data = params.data as string ?? "";
    const loggerMethod = level === "error" ? "error" : level === "warning" ? "warn" : "debug";
    logger[loggerMethod](`[MCP ${this.config.name}:server-log] ${data}`);
  }

  private bufferNotification(method: string, params?: Record<string, unknown>): void {
    const notification: ClientNotification = {
      method,
      params,
      receivedAt: Date.now(),
    };

    this.notificationBuffer.push(notification);
    if (this.notificationBuffer.length > this.maxNotificationBuffer) {
      this.notificationBuffer.shift();
    }
  }

  private extractSessionId(): string | null {
    if (this.transportImpl instanceof SSETransportEnhanced) {
      return this.transportImpl.getSessionId();
    }
    return null;
  }

  private updateSessionActivity(): void {
    if (this._session) {
      this._session.lastActivityAt = Date.now();
    }
  }

  private toolsChanged(oldTools: MCPTool[], newTools: MCPTool[]): boolean {
    if (oldTools.length !== newTools.length) return true;
    const oldNames = new Set(oldTools.map((t) => t.name));
    return newTools.some((t) => !oldNames.has(t.name));
  }

  private resourcesChanged(oldRes: MCPResource[], newRes: MCPResource[]): boolean {
    if (oldRes.length !== newRes.length) return true;
    const oldUris = new Set(oldRes.map((r) => r.uri));
    return newRes.some((r) => !oldUris.has(r.uri));
  }

  private promptsChanged(oldPrompts: MCPPrompt[], newPrompts: MCPPrompt[]): boolean {
    if (oldPrompts.length !== newPrompts.length) return true;
    const oldNames = new Set(oldPrompts.map((p) => p.name));
    return newPrompts.some((p) => !oldNames.has(p.name));
  }

  private async forceClose(): Promise<void> {
    this._isConnected = false;
    this._capabilities = null;
    this._serverInfo = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];
    this._session = null;
    this.notificationBuffer = [];

    try {
      await this.transportImpl.close();
    } catch {
      // Ignore close errors during force close
    }
  }
}

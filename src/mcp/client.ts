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
import { StreamableHttpTransport, SseTransport } from "./http-transport.js";
import { logger } from "../utils/logger.js";

interface TransportWrapper {
  sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown>;
  connect(): Promise<void>;
  close(): Promise<void>;
  get isConnected(): boolean;
}

export class StatefulMCPClient extends MCPStatefulClient {
  private config: MCPClientConfig;
  private transportImpl: TransportWrapper;
  private _capabilities: MCPCapabilities | null = null;
  private _serverInfo: { name: string; version: string } | null = null;
  private _isConnected = false;
  private _tools: MCPTool[] = [];
  private _resources: MCPResource[] = [];
  private _prompts: MCPPrompt[] = [];

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

      if (this._capabilities?.tools) {
        await this.refreshTools();
      }
      if (this._capabilities?.resources) {
        await this.refreshResources();
      }
      if (this._capabilities?.prompts) {
        await this.refreshPrompts();
      }

      this._isConnected = true;
      logger.info(`MCP client connected: ${this.config.name} (server: ${this._serverInfo?.name} v${this._serverInfo?.version})`);
    } catch (error) {
      await this.forceClose();
      throw error;
    }
  }

  override async close(): Promise<void> {
    if (!this._isConnected && !this.transportImpl.isConnected) return;

    this._isConnected = false;
    this._capabilities = null;
    this._serverInfo = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];

    await this.transportImpl.close();
    logger.info(`MCP client disconnected: ${this.config.name}`);
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

    const result = await this.transportImpl.sendRequest("tools/call", {
      name,
      arguments: args,
    }) as MCPToolCallResult;

    return result;
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

    const result = await this.transportImpl.sendRequest("resources/read", { uri }) as {
      contents: MCPResourceContent[];
    };

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

    const result = await this.transportImpl.sendRequest("prompts/get", {
      name,
      arguments: args,
    }) as {
      description?: string;
      messages: MCPPromptMessage[];
    };

    return result.messages;
  }

  async refreshTools(): Promise<void> {
    try {
      const result = await this.transportImpl.sendRequest("tools/list") as {
        tools: MCPTool[];
      };
      this._tools = result.tools || [];
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
      this._resources = result.resources || [];
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
      this._prompts = result.prompts || [];
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
        return new SseTransport(config);
      default:
        throw new Error(`Unknown MCP transport: ${config.transport}`);
    }
  }

  private async forceClose(): Promise<void> {
    this._isConnected = false;
    this._capabilities = null;
    this._serverInfo = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];

    try {
      await this.transportImpl.close();
    } catch {
      // Ignore close errors during force close
    }
  }
}

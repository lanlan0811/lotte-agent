import type { MCPClientConfig } from "../config/schema.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: {};
}

export interface MCPClientInfo {
  name: string;
  version: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPClientInfo;
}

export interface MCPToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri: string; name: string; mimeType?: string };
  }>;
  isError?: boolean;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPPromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri: string; name: string };
  };
}

export abstract class MCPTransport {
  protected config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;
  abstract send(message: unknown): Promise<void>;
  abstract onMessage(handler: (message: unknown) => void): void;

  get isConnected(): boolean {
    return false;
  }
}

export abstract class MCPStatefulClient {
  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;
  abstract get isConnected(): boolean;

  abstract listTools(): Promise<MCPTool[]>;
  abstract callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
  abstract listResources(): Promise<MCPResource[]>;
  abstract readResource(uri: string): Promise<MCPResourceContent[]>;
  abstract listPrompts(): Promise<MCPPrompt[]>;
  abstract getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]>;

  abstract get name(): string;
  abstract get transport(): string;
  abstract get capabilities(): MCPCapabilities | null;

  abstract getToolsSnapshot(): MCPTool[];
  abstract getResourcesSnapshot(): MCPResource[];
  abstract getPromptsSnapshot(): MCPPrompt[];
  abstract getConfig(): MCPClientConfig;
}

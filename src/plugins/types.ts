export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  dependencies?: Record<string, string>;
  hooks?: string[];
  tools?: string[];
  routes?: string[];
}

export interface PluginContext {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  config: Record<string, unknown>;
  registerTool: (tool: PluginToolDefinition) => void;
  registerHook: (hook: PluginHookDefinition) => void;
  registerRoute: (route: PluginRouteDefinition) => void;
}

export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface PluginHookDefinition {
  event: string;
  handler: (...args: unknown[]) => Promise<void>;
}

export interface PluginRouteDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

export interface Plugin {
  manifest: PluginManifest;
  activate(context: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;
}

export type PluginStatus = "loaded" | "active" | "error" | "disabled";

export interface PluginEntry {
  name: string;
  manifest: PluginManifest;
  plugin: Plugin | null;
  status: PluginStatus;
  error?: string;
  loadedAt?: number;
}

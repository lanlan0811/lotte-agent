import type { Plugin, PluginManifest, PluginContext, PluginToolDefinition, PluginHookDefinition, PluginRouteDefinition } from "./types.js";

export abstract class BasePlugin implements Plugin {
  manifest: PluginManifest;
  protected context: PluginContext | null = null;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
  }

  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    await this.onActivate(context);
  }

  async deactivate(): Promise<void> {
    await this.onDeactivate();
    this.context = null;
  }

  protected abstract onActivate(context: PluginContext): Promise<void>;

  protected async onDeactivate(): Promise<void> {}

  protected registerTool(tool: Omit<PluginToolDefinition, "execute"> & { execute: (args: Record<string, unknown>) => Promise<unknown> }): void {
    if (!this.context) throw new Error("Plugin not activated");
    this.context.registerTool(tool);
  }

  protected registerHook(event: string, handler: (...args: unknown[]) => Promise<void>): void {
    if (!this.context) throw new Error("Plugin not activated");
    this.context.registerHook({ event, handler });
  }

  protected registerRoute(method: PluginRouteDefinition["method"], path: string, handler: PluginRouteDefinition["handler"]): void {
    if (!this.context) throw new Error("Plugin not activated");
    this.context.registerRoute({ method, path, handler });
  }

  protected getLogger(): NonNullable<PluginContext["logger"]> {
    if (!this.context) throw new Error("Plugin not activated");
    return this.context.logger;
  }

  protected getConfig(): Record<string, unknown> {
    if (!this.context) throw new Error("Plugin not activated");
    return this.context.config;
  }
}

interface DefinePluginOptions {
  name: string;
  version: string;
  description: string;
  author?: string;
  main?: string;
  dependencies?: Record<string, string>;
  onActivate: (context: PluginContext) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

export function definePlugin(options: DefinePluginOptions): Plugin {
  const manifest: PluginManifest = {
    name: options.name,
    version: options.version,
    description: options.description,
    author: options.author,
    main: options.main ?? "index.js",
    dependencies: options.dependencies,
  };

  return {
    manifest,
    activate: options.onActivate,
    ...(options.onDeactivate ? { deactivate: options.onDeactivate } : {}),
  };
}

export function createToolDefinition(options: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}): PluginToolDefinition {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    execute: options.execute,
  };
}

export function createHookDefinition(options: {
  event: string;
  handler: (...args: unknown[]) => Promise<void>;
}): PluginHookDefinition {
  return {
    event: options.event,
    handler: options.handler,
  };
}

export function createRouteDefinition(options: {
  method: PluginRouteDefinition["method"];
  path: string;
  handler: PluginRouteDefinition["handler"];
}): PluginRouteDefinition {
  return {
    method: options.method,
    path: options.path,
    handler: options.handler,
  };
}

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin, PluginContext, PluginEntry, PluginManifest, PluginToolDefinition, PluginHookDefinition, PluginRouteDefinition } from "./types.js";
import { loadModuleWithJiti } from "./jiti-loader.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export class PluginRegistry {
  private entries: Map<string, PluginEntry> = new Map();
  private tools: Map<string, PluginToolDefinition> = new Map();
  private hooks: Map<string, PluginHookDefinition[]> = new Map();
  private routes: Map<string, PluginRouteDefinition> = new Map();

  register(name: string, plugin: Plugin): void {
    this.entries.set(name, {
      name,
      manifest: plugin.manifest,
      plugin,
      status: "loaded",
    });
  }

  async activate(name: string, config?: Record<string, unknown>): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry || !entry.plugin) {
      throw new Error(`Plugin '${name}' not found`);
    }

    if (entry.status === "active") return;

    const context: PluginContext = {
      logger: {
        info: (msg: string) => logger.info(`[Plugin:${name}] ${msg}`),
        warn: (msg: string) => logger.warn(`[Plugin:${name}] ${msg}`),
        error: (msg: string) => logger.error(`[Plugin:${name}] ${msg}`),
        debug: (msg: string) => logger.debug(`[Plugin:${name}] ${msg}`),
      },
      config: config ?? {},
      registerTool: (tool: PluginToolDefinition) => {
        const toolKey = `${name}:${tool.name}`;
        this.tools.set(toolKey, tool);
        logger.debug(`Plugin '${name}' registered tool: ${tool.name}`);
      },
      registerHook: (hook: PluginHookDefinition) => {
        const hookList = this.hooks.get(hook.event) ?? [];
        hookList.push(hook);
        this.hooks.set(hook.event, hookList);
        logger.debug(`Plugin '${name}' registered hook: ${hook.event}`);
      },
      registerRoute: (route: PluginRouteDefinition) => {
        const routeKey = `${route.method}:${route.path}`;
        this.routes.set(routeKey, route);
        logger.debug(`Plugin '${name}' registered route: ${route.method} ${route.path}`);
      },
    };

    try {
      await entry.plugin.activate(context);
      entry.status = "active";
      entry.loadedAt = Date.now();
      logger.info(`Plugin '${name}' activated`);
    } catch (error) {
      entry.status = "error";
      entry.error = formatErrorMessage(error);
      logger.error(`Plugin '${name}' activation failed: ${entry.error}`);
      throw error;
    }
  }

  async deactivate(name: string): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry || !entry.plugin) return;

    if (entry.status !== "active") return;

    try {
      if (entry.plugin.deactivate) {
        await entry.plugin.deactivate();
      }

      for (const [toolKey] of this.tools) {
        if (toolKey.startsWith(`${name}:`)) {
          this.tools.delete(toolKey);
        }
      }

      for (const [event, hookList] of this.hooks) {
        this.hooks.set(
          event,
          hookList.filter((h) => !h.handler.toString().includes(`Plugin:${name}`)),
        );
      }

      for (const [routeKey] of this.routes) {
        if (routeKey.startsWith(`${name}:`)) {
          this.routes.delete(routeKey);
        }
      }

      entry.status = "disabled";
      logger.info(`Plugin '${name}' deactivated`);
    } catch (error) {
      entry.status = "error";
      entry.error = formatErrorMessage(error);
      logger.error(`Plugin '${name}' deactivation failed: ${entry.error}`);
    }
  }

  async deactivateAll(): Promise<void> {
    for (const [name, entry] of this.entries) {
      if (entry.status === "active") {
        await this.deactivate(name);
      }
    }
  }

  getPlugin(name: string): PluginEntry | undefined {
    return this.entries.get(name);
  }

  getAllPlugins(): PluginEntry[] {
    return [...this.entries.values()];
  }

  getActivePlugins(): PluginEntry[] {
    return [...this.entries.values()].filter((e) => e.status === "active");
  }

  getTools(): Map<string, PluginToolDefinition> {
    return new Map(this.tools);
  }

  getHooks(event: string): PluginHookDefinition[] {
    return this.hooks.get(event) ?? [];
  }

  getRoutes(): Map<string, PluginRouteDefinition> {
    return new Map(this.routes);
  }
}

export class PluginLoader {
  private pluginsDir: string;

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
  }

  discoverPlugins(): PluginManifest[] {
    const manifests: PluginManifest[] = [];

    if (!existsSync(this.pluginsDir)) {
      return manifests;
    }

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = join(this.pluginsDir, entry.name, "plugin.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const data = readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(data) as PluginManifest;

        if (!manifest.name || !manifest.version || !manifest.main) {
          logger.warn(`Plugin '${entry.name}' has invalid manifest`);
          continue;
        }

        manifests.push(manifest);
      } catch {
        logger.warn(`Failed to read plugin manifest: ${entry.name}`);
      }
    }

    return manifests;
  }

  async loadPlugin(manifest: PluginManifest): Promise<Plugin> {
    const pluginDir = join(this.pluginsDir, manifest.name);
    const mainPath = resolve(pluginDir, manifest.main);

    if (!existsSync(mainPath)) {
      throw new Error(`Plugin main file not found: ${mainPath}`);
    }

    try {
      const module = await loadModuleWithJiti(mainPath) as Record<string, unknown>;

      const pluginClass = module.default ?? module.Plugin ?? module[manifest.name];
      if (!pluginClass) {
        throw new Error(`Plugin module does not export a Plugin class`);
      }

      const plugin: Plugin = typeof pluginClass === "function"
        ? new (pluginClass as new () => Plugin)()
        : (pluginClass as Plugin);

      plugin.manifest = manifest;
      return plugin;
    } catch (error) {
      throw new Error(
        `Failed to load plugin '${manifest.name}': ${formatErrorMessage(error)}`,
      );
    }
  }
}

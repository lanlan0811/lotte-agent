import { watchFile, unwatchFile, type Stats } from "node:fs";
import type { MCPClientManager } from "./manager.js";
import type { MCPConfig, MCPClientConfig } from "../config/schema.js";
import { logger } from "../utils/logger.js";

const DEFAULT_POLL_INTERVAL = 3000;

export class MCPConfigWatcher {
  private mcpManager: MCPClientManager;
  private configLoader: () => MCPConfig | null;
  private pollInterval: number;
  private configPath: string | null;
  private lastMcpHash: string | null = null;
  private lastMtime = 0;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reloadInProgress = false;

  constructor(
    mcpManager: MCPClientManager,
    configLoader: () => MCPConfig | null,
    options?: {
      pollInterval?: number;
      configPath?: string;
    },
  ) {
    this.mcpManager = mcpManager;
    this.configLoader = configLoader;
    this.pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.configPath = options?.configPath ?? null;
  }

  start(): void {
    if (this.isRunning) return;

    this.snapshot();
    this.isRunning = true;

    if (this.configPath) {
      watchFile(this.configPath, { interval: this.pollInterval }, (curr: Stats) => {
        if (curr.mtimeMs !== this.lastMtime) {
          this.lastMtime = curr.mtimeMs;
          this.check();
        }
      });
    } else {
      this.pollTimer = setInterval(() => {
        this.check();
      }, this.pollInterval);
    }

    logger.info(`MCP config watcher started (poll=${this.pollInterval}ms)`);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.configPath) {
      unwatchFile(this.configPath);
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info("MCP config watcher stopped");
  }

  private snapshot(): void {
    const config = this.configLoader();
    if (config) {
      this.lastMcpHash = this.computeHash(config);
    }
  }

  private async check(): Promise<void> {
    if (this.reloadInProgress) return;

    const config = this.configLoader();
    if (!config) return;

    const newHash = this.computeHash(config);
    if (newHash === this.lastMcpHash) return;

    logger.info("MCP config change detected, starting reload");
    this.lastMcpHash = newHash;

    this.reloadInProgress = true;
    try {
      await this.reloadChangedClients(config);
    } catch (error) {
      logger.error(`MCP config reload error: ${error}`);
    } finally {
      this.reloadInProgress = false;
    }
  }

  private async reloadChangedClients(newConfig: MCPConfig): Promise<void> {
    const currentEntries = this.mcpManager.getAllEntries();
    const currentKeys = new Set(currentEntries.map((e) => e.key));
    const newKeys = new Set(Object.keys(newConfig.clients));

    for (const key of newKeys) {
      const clientConfig = newConfig.clients[key];
      if (!clientConfig) continue;

      if (!clientConfig.enabled) {
        if (currentKeys.has(key)) {
          logger.debug(`MCP client '${key}' disabled, removing`);
          await this.mcpManager.removeClient(key);
        }
        continue;
      }

      if (currentKeys.has(key)) {
        const entry = this.mcpManager.getEntry(key);
        if (entry && this.clientConfigChanged(entry.client.getConfig(), clientConfig)) {
          logger.debug(`MCP client '${key}' config changed, replacing`);
          try {
            await this.mcpManager.replaceClient(key, clientConfig);
          } catch (error) {
            logger.warn(`Failed to replace MCP client '${key}': ${error}`);
          }
        }
      } else {
        logger.debug(`MCP client '${key}' is new, adding`);
        try {
          await this.mcpManager.addClient(key, clientConfig);
        } catch (error) {
          logger.warn(`Failed to add MCP client '${key}': ${error}`);
        }
      }
    }

    for (const key of currentKeys) {
      if (!newKeys.has(key)) {
        logger.debug(`MCP client '${key}' removed from config, deleting`);
        await this.mcpManager.removeClient(key);
      }
    }
  }

  private clientConfigChanged(oldConfig: MCPClientConfig, newConfig: MCPClientConfig): boolean {
    return (
      oldConfig.name !== newConfig.name ||
      oldConfig.transport !== newConfig.transport ||
      oldConfig.command !== newConfig.command ||
      oldConfig.url !== newConfig.url ||
      oldConfig.cwd !== newConfig.cwd ||
      JSON.stringify(oldConfig.args) !== JSON.stringify(newConfig.args) ||
      JSON.stringify(oldConfig.env) !== JSON.stringify(newConfig.env) ||
      JSON.stringify(oldConfig.headers) !== JSON.stringify(newConfig.headers)
    );
  }

  private computeHash(config: MCPConfig): string {
    const normalized: Record<string, unknown> = {};
    for (const [key, client] of Object.entries(config.clients)) {
      normalized[key] = {
        name: client.name,
        enabled: client.enabled,
        transport: client.transport,
        command: client.command,
        args: client.args,
        url: client.url,
        headers: client.headers,
        env: client.env,
        cwd: client.cwd,
      };
    }
    const json = JSON.stringify(normalized);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(36);
  }
}

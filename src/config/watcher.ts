import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import type { ConfigLoader } from "./loader.js";
import { logger } from "../utils/logger.js";

const CONFIG_FILE_MAP: Record<string, string> = {
  "lotte.json": "main",
  "ai.json": "ai",
  "gateway.json": "gateway",
  "channels.json": "channels",
  "mcp.json": "mcp",
  "skills.json": "skills",
  "tools.json": "tools",
  "automation.json": "automation",
  "notification.json": "notification",
  "rag.json": "rag",
  "multimodal.json": "multimodal",
};

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private configLoader: ConfigLoader;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;

  constructor(configLoader: ConfigLoader, debounceMs = 500) {
    this.configLoader = configLoader;
    this.debounceMs = debounceMs;
  }

  start(): void {
    const configDir = this.configLoader.getPaths().configDir;

    if (!fs.existsSync(configDir)) {
      logger.warn(`Config directory does not exist: ${configDir}`);
      return;
    }

    this.watcher = chokidar.watch(`${configDir}/*.json`, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", (filePath: string) => {
      this.handleFileChange(filePath);
    });

    this.watcher.on("add", (filePath: string) => {
      this.handleFileChange(filePath);
    });

    logger.info(`Config watcher started on ${configDir}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    logger.info("Config watcher stopped");
  }

  private handleFileChange(filePath: string): void {
    const fileName = filePath.split(/[/\\]/).pop();
    if (!fileName) return;

    const configName = CONFIG_FILE_MAP[fileName];
    if (!configName) return;

    const existingTimer = this.debounceTimers.get(configName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(configName);
      logger.info(`Config file changed: ${fileName}, reloading ${configName}`);
      this.configLoader.reloadConfig(configName);
    }, this.debounceMs);

    this.debounceTimers.set(configName, timer);
  }
}

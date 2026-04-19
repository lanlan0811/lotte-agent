import type { MCPClientConfig, MCPConfig } from "../config/schema.js";
import { StatefulMCPClient } from "./client.js";
import type { MCPTool } from "./types.js";
import { logger } from "../utils/logger.js";

const CONNECT_TIMEOUT = 60_000;

export interface MCPClientEntry {
  key: string;
  client: StatefulMCPClient;
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
  connectedAt?: number;
}

export class MCPClientManager {
  private entries: Map<string, MCPClientEntry> = new Map();

  async initFromConfig(config: MCPConfig): Promise<void> {
    logger.info(`Initializing MCP clients from config (${Object.keys(config.clients).length} clients)`);

    for (const [key, clientConfig] of Object.entries(config.clients)) {
      if (!clientConfig.enabled) {
        logger.debug(`MCP client '${key}' is disabled, skipping`);
        continue;
      }

      try {
        await this.addClient(key, clientConfig);
        logger.info(`MCP client '${key}' initialized successfully`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to initialize MCP client '${key}': ${msg}`);
        this.entries.set(key, {
          key,
          client: new StatefulMCPClient(clientConfig),
          status: "error",
          error: msg,
        });
      }
    }
  }

  async addClient(key: string, config: MCPClientConfig): Promise<void> {
    const client = new StatefulMCPClient(config);

    this.entries.set(key, {
      key,
      client,
      status: "connecting",
    });

    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT, `MCP client '${key}' connect`);
      this.entries.set(key, {
        key,
        client,
        status: "connected",
        connectedAt: Date.now(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.entries.set(key, {
        key,
        client,
        status: "error",
        error: msg,
      });
      throw error;
    }
  }

  async replaceClient(key: string, config: MCPClientConfig): Promise<void> {
    logger.debug(`Replacing MCP client: ${key}`);

    const newClient = new StatefulMCPClient(config);

    this.entries.set(key, {
      key,
      client: newClient,
      status: "connecting",
    });

    try {
      await withTimeout(newClient.connect(), CONNECT_TIMEOUT, `MCP client '${key}' replace`);

      const oldEntry = this.entries.get(key);
      if (oldEntry && oldEntry.client !== newClient) {
        try {
          await oldEntry.client.close();
        } catch (error) {
          logger.debug(`Error closing old MCP client '${key}': ${error}`);
        }
      }

      this.entries.set(key, {
        key,
        client: newClient,
        status: "connected",
        connectedAt: Date.now(),
      });

      logger.info(`MCP client '${key}' replaced successfully`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      try {
        await newClient.close();
      } catch {
        // Ignore
      }

      this.entries.set(key, {
        key,
        client: newClient,
        status: "error",
        error: msg,
      });

      throw error;
    }
  }

  async removeClient(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;

    this.entries.delete(key);

    try {
      await entry.client.close();
      logger.info(`MCP client '${key}' removed`);
    } catch (error) {
      logger.debug(`Error closing MCP client '${key}': ${error}`);
    }
  }

  async closeAll(): Promise<void> {
    const snapshot = [...this.entries.entries()];
    this.entries.clear();

    for (const [key, entry] of snapshot) {
      try {
        await entry.client.close();
      } catch (error) {
        logger.debug(`Error closing MCP client '${key}': ${error}`);
      }
    }

    logger.info("All MCP clients closed");
  }

  getConnectedClients(): StatefulMCPClient[] {
    return [...this.entries.values()]
      .filter((e) => e.status === "connected" && e.client.isConnected)
      .map((e) => e.client);
  }

  getAllEntries(): MCPClientEntry[] {
    return [...this.entries.values()];
  }

  getEntry(key: string): MCPClientEntry | undefined {
    return this.entries.get(key);
  }

  getClient(key: string): StatefulMCPClient | undefined {
    return this.entries.get(key)?.client;
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const entry of this.entries.values()) {
      if (entry.status === "connected" && entry.client.isConnected) {
        tools.push(...entry.client.getToolsSnapshot());
      }
    }
    return tools;
  }

  getToolsByClient(key: string): MCPTool[] {
    const entry = this.entries.get(key);
    if (!entry || entry.status !== "connected") return [];
    return entry.client.getToolsSnapshot();
  }

  async callTool(clientKey: string, toolName: string, args: Record<string, unknown>) {
    const entry = this.entries.get(clientKey);
    if (!entry || entry.status !== "connected") {
      throw new Error(`MCP client '${clientKey}' not connected`);
    }
    return entry.client.callTool(toolName, args);
  }

  getStatus(): Record<string, {
    status: string;
    name: string;
    transport: string;
    error?: string;
    toolCount: number;
    connectedAt?: number;
  }> {
    const result: Record<string, {
      status: string;
      name: string;
      transport: string;
      error?: string;
      toolCount: number;
      connectedAt?: number;
    }> = {};

    for (const [key, entry] of this.entries) {
      result[key] = {
        status: entry.status,
        name: entry.client.name,
        transport: entry.client.transport,
        error: entry.error,
        toolCount: entry.client.getToolsSnapshot().length,
        connectedAt: entry.connectedAt,
      };
    }

    return result;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

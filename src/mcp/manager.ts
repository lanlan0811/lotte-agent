import type { MCPClientConfig, MCPConfig } from "../config/schema.js";
import { StatefulMCPClient } from "./client.js";
import { EnhancedStatefulClient } from "./stateful-client.js";
import { RecoveryManager, type RecoveryPhase, type RecoveryConfig } from "./recovery.js";
import { MCPStatefulClient, type MCPTool } from "./types.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

const CONNECT_TIMEOUT = 60_000;
const RECONNECT_BASE_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_MAX_DELAY = 300_000;

interface FailureRecord {
  timestamp: number;
  error: string;
}

interface CircuitBreakerState {
  failures: FailureRecord[];
  lastFailureAt: number | null;
  consecutiveFailures: number;
  state: "closed" | "open" | "half_open";
  openedAt: number | null;
  halfOpenSuccesses: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;
const CIRCUIT_BREAKER_HALF_OPEN_MAX = 2;
const FAILURE_WINDOW_MS = 300_000;
const MAX_FAILURE_RECORDS = 100;

export interface MCPClientEntry {
  key: string;
  client: MCPStatefulClient;
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
  connectedAt?: number;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  circuitBreaker: CircuitBreakerState;
  toolFailureTracker: Map<string, FailureRecord[]>;
  recoveryState?: RecoveryPhase;
}

export class MCPClientManager {
  private entries: Map<string, MCPClientEntry> = new Map();
  private recoveryManager: RecoveryManager;
  private useEnhancedRecovery: boolean;

  constructor(opts?: { useEnhancedRecovery?: boolean; recoveryConfig?: Partial<RecoveryConfig> }) {
    this.useEnhancedRecovery = opts?.useEnhancedRecovery ?? false;
    this.recoveryManager = new RecoveryManager();
    this.recoveryManager.setGlobalHandlers({
      stateChanged: (oldState, newState, key) => {
        const entry = this.entries.get(key);
        if (entry) {
          entry.recoveryState = newState;
        }
        logger.debug(`MCP client '${key}' recovery state: ${oldState} â†?${newState}`);
      },
      recovered: (key) => {
        const entry = this.entries.get(key);
        if (entry) {
          entry.status = "connected";
          entry.connectedAt = Date.now();
          entry.error = undefined;
          entry.circuitBreaker = this.defaultCircuitBreaker();
          entry.toolFailureTracker.clear();
        }
      },
      failed: (key, error) => {
        const entry = this.entries.get(key);
        if (entry) {
          entry.status = "error";
          entry.error = error;
        }
      },
    });
  }

  private defaultCircuitBreaker(): CircuitBreakerState {
    return {
      failures: [],
      lastFailureAt: null,
      consecutiveFailures: 0,
      state: "closed",
      openedAt: null,
      halfOpenSuccesses: 0,
    };
  }

  private defaultEntry(key: string, client: MCPStatefulClient, status: MCPClientEntry["status"], error?: string): MCPClientEntry {
    return {
      key,
      client,
      status,
      error,
      reconnectAttempts: 0,
      reconnectTimer: null,
      circuitBreaker: this.defaultCircuitBreaker(),
      toolFailureTracker: new Map(),
    };
  }

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
        const msg = formatErrorMessage(error);
        logger.warn(`Failed to initialize MCP client '${key}': ${msg}`);
        this.entries.set(key, this.defaultEntry(key, new StatefulMCPClient(clientConfig), "error", msg));
      }
    }
  }

  async addClient(key: string, config: MCPClientConfig): Promise<void> {
    if (this.useEnhancedRecovery) {
      try {
        const client = await this.recoveryManager.addClient(key, config);
        const entry = this.defaultEntry(key, client, "connected");
        entry.connectedAt = Date.now();
        entry.recoveryState = "healthy";
        this.entries.set(key, entry);
        return;
      } catch (error) {
        const msg = formatErrorMessage(error);
        const fallbackClient = new EnhancedStatefulClient(config);
        this.entries.set(key, this.defaultEntry(key, fallbackClient, "error", msg));
        throw error;
      }
    }

    const client = new StatefulMCPClient(config);

    this.entries.set(key, this.defaultEntry(key, client, "connecting"));

    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT, `MCP client '${key}' connect`);
      const entry = this.defaultEntry(key, client, "connected");
      entry.connectedAt = Date.now();
      this.entries.set(key, entry);
    } catch (error) {
      const msg = formatErrorMessage(error);
      this.entries.set(key, this.defaultEntry(key, client, "error", msg));
      throw error;
    }
  }

  async replaceClient(key: string, config: MCPClientConfig): Promise<void> {
    if (this.useEnhancedRecovery) {
      try {
        await this.recoveryManager.removeClient(key);
      } catch {
        // Ignore removal errors
      }

      try {
        const client = await this.recoveryManager.addClient(key, config);
        const entry = this.defaultEntry(key, client, "connected");
        entry.connectedAt = Date.now();
        entry.recoveryState = "healthy";
        this.entries.set(key, entry);
        logger.info(`MCP client '${key}' replaced via recovery manager`);
        return;
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.warn(`MCP client '${key}' recovery replace failed: ${msg}`);
        throw error;
      }
    }

    logger.debug(`Atomic hot-replacing MCP client: ${key}`);

    const newClient = new StatefulMCPClient(config);

    try {
      await withTimeout(newClient.connect(), CONNECT_TIMEOUT, `MCP client '${key}' hot-replace connect`);

      const toolsSnapshot = newClient.getToolsSnapshot();
      const isHealthy = newClient.isConnected && toolsSnapshot.length >= 0;
      if (!isHealthy) {
        throw new Error(`MCP client '${key}' health check failed after connect`);
      }

      logger.info(`MCP client '${key}' new connection verified, swapping...`);
    } catch (error) {
      const msg = formatErrorMessage(error);
      try {
        await newClient.close();
      } catch {
        // Ignore
      }

      const oldEntry = this.entries.get(key);
      if (oldEntry && oldEntry.status === "connected") {
        logger.warn(`MCP client '${key}' hot-replace failed, keeping old connection: ${msg}`);
      }

      throw error;
    }

    const oldEntry = this.entries.get(key);
    if (oldEntry) {
      if (oldEntry.reconnectTimer) {
        clearTimeout(oldEntry.reconnectTimer);
      }

      try {
        await oldEntry.client.close();
        logger.debug(`MCP client '${key}' old connection closed after successful swap`);
      } catch (error) {
        logger.debug(`Error closing old MCP client '${key}': ${error}`);
      }
    }

    const entry = this.defaultEntry(key, newClient, "connected");
    entry.connectedAt = Date.now();
    this.entries.set(key, entry);

    logger.info(`MCP client '${key}' atomic hot-replace completed successfully`);
  }

  async removeClient(key: string): Promise<void> {
    if (this.useEnhancedRecovery) {
      await this.recoveryManager.removeClient(key);
    }

    const entry = this.entries.get(key);
    if (!entry) return;

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }

    this.entries.delete(key);

    try {
      await entry.client.close();
      logger.info(`MCP client '${key}' removed`);
    } catch (error) {
      logger.debug(`Error closing MCP client '${key}': ${error}`);
    }
  }

  async closeAll(): Promise<void> {
    if (this.useEnhancedRecovery) {
      await this.recoveryManager.closeAll();
    }

    const snapshot = [...this.entries.entries()];
    this.entries.clear();

    for (const [key, entry] of snapshot) {
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
      }

      try {
        await entry.client.close();
      } catch (error) {
        logger.debug(`Error closing MCP client '${key}': ${error}`);
      }
    }

    logger.info("All MCP clients closed");
  }

  async reconnectClient(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`MCP client '${key}' not found`);
    }

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }

    try {
      await entry.client.close();
    } catch {
      // ignore
    }

    entry.status = "connecting";
    entry.error = undefined;

    try {
      await withTimeout(entry.client.connect(), CONNECT_TIMEOUT, `MCP client '${key}' reconnect`);
      entry.status = "connected";
      entry.connectedAt = Date.now();
      entry.reconnectAttempts = 0;
      entry.reconnectTimer = null;
      entry.error = undefined;
      entry.circuitBreaker = this.defaultCircuitBreaker();
      entry.toolFailureTracker.clear();
      logger.info(`MCP client '${key}' reconnected successfully`);
    } catch (error) {
      const msg = formatErrorMessage(error);
      entry.status = "error";
      entry.error = msg;
      this.recordFailure(entry, msg);
      this.scheduleReconnect(key);
      throw error;
    }
  }

  private scheduleReconnect(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    if (entry.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn(`MCP client '${key}' exceeded max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}), entering extended backoff`);
      entry.reconnectAttempts = Math.floor(MAX_RECONNECT_ATTEMPTS / 2);
    }

    entry.reconnectAttempts++;
    const baseDelay = RECONNECT_BASE_DELAY * Math.pow(2, Math.min(entry.reconnectAttempts - 1, 8));
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.min(baseDelay + jitter, RECONNECT_MAX_DELAY);

    logger.info(`MCP client '${key}' reconnecting in ${delay}ms (attempt ${entry.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    entry.reconnectTimer = setTimeout(async () => {
      entry.reconnectTimer = null;
      try {
        await this.reconnectClient(key);
      } catch {
        // scheduleReconnect is called inside reconnectClient on failure
      }
    }, delay);
  }

  async healthCheck(): Promise<Record<string, { healthy: boolean; error?: string }>> {
    const result: Record<string, { healthy: boolean; error?: string }> = {};

    for (const [key, entry] of this.entries) {
      if (entry.status === "connected") {
        if (entry.client.isConnected) {
          result[key] = { healthy: true };
        } else {
          result[key] = { healthy: false, error: "Client reports disconnected" };
          this.entries.set(key, {
            ...entry,
            status: "error",
            error: "Client reports disconnected",
          });
          this.scheduleReconnect(key);
        }
      } else {
        result[key] = { healthy: false, error: entry.error };
      }
    }

    return result;
  }

  getConnectedClients(): MCPStatefulClient[] {
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

  getClient(key: string): MCPStatefulClient | undefined {
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

    if (!this.checkCircuitBreaker(entry)) {
      throw new Error(`MCP client '${clientKey}' circuit breaker is open, please retry later`);
    }

    if (this.isToolInBackoff(entry, toolName)) {
      throw new Error(`MCP tool '${toolName}' on client '${clientKey}' is in backoff, please retry later`);
    }

    try {
      const result = await entry.client.callTool(toolName, args);
      this.recordSuccess(entry, toolName);
      return result;
    } catch (error) {
      const msg = formatErrorMessage(error);
      this.recordFailure(entry, msg, toolName);
      throw error;
    }
  }

  private recordFailure(entry: MCPClientEntry, error: string, toolName?: string): void {
    const now = Date.now();
    const record: FailureRecord = { timestamp: now, error };

    entry.circuitBreaker.failures.push(record);
    entry.circuitBreaker.lastFailureAt = now;
    entry.circuitBreaker.consecutiveFailures++;

    if (entry.circuitBreaker.failures.length > MAX_FAILURE_RECORDS) {
      entry.circuitBreaker.failures = entry.circuitBreaker.failures.slice(-MAX_FAILURE_RECORDS);
    }

    if (entry.circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      entry.circuitBreaker.state = "open";
      entry.circuitBreaker.openedAt = now;
      logger.warn(`MCP client '${entry.key}' circuit breaker opened after ${entry.circuitBreaker.consecutiveFailures} consecutive failures`);
    }

    if (toolName) {
      const toolFailures = entry.toolFailureTracker.get(toolName) ?? [];
      toolFailures.push(record);
      if (toolFailures.length > MAX_FAILURE_RECORDS) {
        entry.toolFailureTracker.set(toolName, toolFailures.slice(-MAX_FAILURE_RECORDS));
      } else {
        entry.toolFailureTracker.set(toolName, toolFailures);
      }
    }
  }

  private recordSuccess(entry: MCPClientEntry, toolName?: string): void {
    if (entry.circuitBreaker.state === "half_open") {
      entry.circuitBreaker.halfOpenSuccesses++;
      if (entry.circuitBreaker.halfOpenSuccesses >= CIRCUIT_BREAKER_HALF_OPEN_MAX) {
        entry.circuitBreaker.state = "closed";
        entry.circuitBreaker.consecutiveFailures = 0;
        entry.circuitBreaker.openedAt = null;
        entry.circuitBreaker.halfOpenSuccesses = 0;
        logger.info(`MCP client '${entry.key}' circuit breaker closed after successful recovery`);
      }
    } else {
      entry.circuitBreaker.consecutiveFailures = 0;
    }

    if (toolName) {
      entry.toolFailureTracker.delete(toolName);
    }
  }

  private checkCircuitBreaker(entry: MCPClientEntry): boolean {
    const cb = entry.circuitBreaker;

    if (cb.state === "closed") {
      return true;
    }

    if (cb.state === "open") {
      if (cb.openedAt && Date.now() - cb.openedAt >= CIRCUIT_BREAKER_RESET_MS) {
        cb.state = "half_open";
        cb.halfOpenSuccesses = 0;
        logger.info(`MCP client '${entry.key}' circuit breaker moved to half-open`);
        return true;
      }
      return false;
    }

    if (cb.state === "half_open") {
      return true;
    }

    return false;
  }

  private isToolInBackoff(entry: MCPClientEntry, toolName: string): boolean {
    const failures = entry.toolFailureTracker.get(toolName);
    if (!failures || failures.length === 0) return false;

    const recentFailures = failures.filter(
      (f) => Date.now() - f.timestamp < FAILURE_WINDOW_MS,
    );

    if (recentFailures.length < 3) return false;

    const lastFailure = recentFailures[recentFailures.length - 1]!;
    const backoffDelay = RECONNECT_BASE_DELAY * Math.pow(2, Math.min(recentFailures.length - 1, 5));
    const backoffUntil = lastFailure.timestamp + backoffDelay;

    return Date.now() < backoffUntil;
  }

  getStatus(): Record<string, {
    status: string;
    name: string;
    transport: string;
    error?: string;
    toolCount: number;
    connectedAt?: number;
    recoveryState?: RecoveryPhase;
  }> {
    const result: Record<string, {
      status: string;
      name: string;
      transport: string;
      error?: string;
      toolCount: number;
      connectedAt?: number;
      recoveryState?: RecoveryPhase;
    }> = {};

    for (const [key, entry] of this.entries) {
      result[key] = {
        status: entry.status,
        name: entry.client.name,
        transport: entry.client.transport,
        error: entry.error,
        toolCount: entry.client.getToolsSnapshot().length,
        connectedAt: entry.connectedAt,
        recoveryState: entry.recoveryState,
      };
    }

    return result;
  }

  getRecoveryStatus(): Record<string, ReturnType<RecoveryManager["getStatus"]>[string]> {
    return this.recoveryManager.getStatus();
  }

  async rebuildClient(key: string): Promise<void> {
    if (this.useEnhancedRecovery) {
      await this.recoveryManager.rebuildClient(key);
      return;
    }
    await this.reconnectClient(key);
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

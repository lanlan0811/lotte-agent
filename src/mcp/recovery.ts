import type { MCPClientConfig } from "../config/schema.js";
import { EnhancedStatefulClient } from "./stateful-client.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export interface FailureRecord {
  timestamp: number;
  error: string;
  phase: "connect" | "call" | "health" | "reconnect";
}

export interface RecoveryState {
  consecutiveFailures: number;
  totalFailures: number;
  lastFailureAt: number | null;
  lastError: string | null;
  state: RecoveryPhase;
  stateEnteredAt: number;
  reconnectAttempts: number;
  nextReconnectAt: number | null;
}

export type RecoveryPhase = "healthy" | "degraded" | "recovering" | "failed";

export interface RecoveryConfig {
  baseDelay: number;
  maxDelay: number;
  maxAttempts: number;
  degradedThreshold: number;
  failedThreshold: number;
  healthCheckInterval: number;
  failureWindowMs: number;
  maxFailureRecords: number;
}

const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  baseDelay: 2000,
  maxDelay: 120_000,
  maxAttempts: 50,
  degradedThreshold: 2,
  failedThreshold: 5,
  healthCheckInterval: 30_000,
  failureWindowMs: 300_000,
  maxFailureRecords: 100,
};

export class ClientRecovery {
  private clientKey: string;
  private clientConfig: MCPClientConfig;
  private client: EnhancedStatefulClient | null = null;
  private config: RecoveryConfig;
  private state: RecoveryState;
  private failures: FailureRecord[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  private eventHandlers: {
    stateChanged?: (oldState: RecoveryPhase, newState: RecoveryPhase, key: string) => void;
    recovered?: (key: string) => void;
    failed?: (key: string, error: string) => void;
  } = {};

  constructor(
    clientKey: string,
    clientConfig: MCPClientConfig,
    config?: Partial<RecoveryConfig>,
  ) {
    this.clientKey = clientKey;
    this.clientConfig = clientConfig;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };

    this.state = {
      consecutiveFailures: 0,
      totalFailures: 0,
      lastFailureAt: null,
      lastError: null,
      state: "healthy",
      stateEnteredAt: Date.now(),
      reconnectAttempts: 0,
      nextReconnectAt: null,
    };
  }

  setEventHandlers(handlers: {
    stateChanged?: (oldState: RecoveryPhase, newState: RecoveryPhase, key: string) => void;
    recovered?: (key: string) => void;
    failed?: (key: string, error: string) => void;
  }): void {
    this.eventHandlers = handlers;
  }

  getClient(): EnhancedStatefulClient | null {
    return this.client;
  }

  getClientOrThrow(): EnhancedStatefulClient {
    if (!this.client) {
      throw new Error(`MCP client '${this.clientKey}' not initialized`);
    }
    return this.client;
  }

  getState(): RecoveryState {
    return { ...this.state };
  }

  getFailures(): FailureRecord[] {
    return [...this.failures];
  }

  getRecentFailures(windowMs?: number): FailureRecord[] {
    const window = windowMs ?? this.config.failureWindowMs;
    const cutoff = Date.now() - window;
    return this.failures.filter((f) => f.timestamp >= cutoff);
  }

  async connect(): Promise<void> {
    this.isShuttingDown = false;

    this.client = new EnhancedStatefulClient(this.clientConfig);

    try {
      await this.client.connect();
      this.onConnectSuccess();
    } catch (error) {
      this.recordFailure(error, "connect");
      this.onConnectFailure();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.cancelReconnect();
    this.stopHealthCheck();

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.debug(`Recovery: error closing client '${this.clientKey}': ${error}`);
      }
      this.client = null;
    }

    this.transitionTo("healthy");
  }

  async rebuild(): Promise<void> {
    logger.info(`Recovery: rebuilding client '${this.clientKey}'`);

    this.cancelReconnect();

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.debug(`Recovery: error closing old client '${this.clientKey}': ${error}`);
      }
      this.client = null;
    }

    this.client = new EnhancedStatefulClient(this.clientConfig);

    try {
      await this.client.connect();
      this.onConnectSuccess();
      logger.info(`Recovery: client '${this.clientKey}' rebuilt successfully`);
    } catch (error) {
      this.recordFailure(error, "reconnect");
      this.onConnectFailure();
      throw error;
    }
  }

  startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  recordCallFailure(error: unknown): void {
    this.recordFailure(error, "call");
    this.evaluateState();
  }

  recordCallSuccess(): void {
    if (this.state.consecutiveFailures > 0) {
      this.state.consecutiveFailures = 0;
    }

    if (this.state.state === "degraded" || this.state.state === "recovering") {
      this.transitionTo("healthy");
      this.eventHandlers.recovered?.(this.clientKey);
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.client) return;

    if (!this.client.isConnected) {
      this.recordFailure(new Error("Client reports disconnected"), "health");
      this.evaluateState();

      if (this.state.state !== "recovering") {
        this.scheduleReconnect();
      }
      return;
    }

    try {
      await this.client.listTools();
    } catch (error) {
      this.recordFailure(error, "health");
      this.evaluateState();
    }
  }

  private onConnectSuccess(): void {
    this.state.consecutiveFailures = 0;
    this.state.reconnectAttempts = 0;
    this.state.nextReconnectAt = null;
    this.state.lastError = null;
    this.transitionTo("healthy");
    this.startHealthCheck();
    this.eventHandlers.recovered?.(this.clientKey);
  }

  private onConnectFailure(): void {
    this.evaluateState();

    if (!this.isShuttingDown) {
      this.scheduleReconnect();
    }
  }

  private recordFailure(error: unknown, phase: FailureRecord["phase"]): void {
    const errorMsg = formatErrorMessage(error);
    const now = Date.now();

    const record: FailureRecord = {
      timestamp: now,
      error: errorMsg,
      phase,
    };

    this.failures.push(record);

    if (this.failures.length > this.config.maxFailureRecords) {
      this.failures = this.failures.slice(-this.config.maxFailureRecords);
    }

    this.state.consecutiveFailures++;
    this.state.totalFailures++;
    this.state.lastFailureAt = now;
    this.state.lastError = errorMsg;

    logger.debug(`Recovery: client '${this.clientKey}' failure recorded (phase=${phase}, consecutive=${this.state.consecutiveFailures}): ${errorMsg}`);
  }

  private evaluateState(): void {
    const consecutive = this.state.consecutiveFailures;

    if (consecutive >= this.config.failedThreshold) {
      this.transitionTo("failed");
      this.eventHandlers.failed?.(this.clientKey, this.state.lastError ?? "Unknown error");
    } else if (consecutive >= this.config.degradedThreshold) {
      this.transitionTo("recovering");
    } else if (consecutive > 0) {
      this.transitionTo("degraded");
    }
  }

  private transitionTo(newState: RecoveryPhase): void {
    if (this.state.state === newState) return;

    const oldState = this.state.state;
    this.state.state = newState;
    this.state.stateEnteredAt = Date.now();

    logger.info(`Recovery: client '${this.clientKey}' state: ${oldState} -> ${newState}`);
    this.eventHandlers.stateChanged?.(oldState, newState, this.clientKey);
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();

    if (this.isShuttingDown) return;

    if (this.state.reconnectAttempts >= this.config.maxAttempts) {
      logger.warn(`Recovery: client '${this.clientKey}' exceeded max reconnect attempts (${this.config.maxAttempts})`);
      this.transitionTo("failed");
      this.eventHandlers.failed?.(this.clientKey, "Max reconnect attempts exceeded");
      return;
    }

    this.state.reconnectAttempts++;

    const attempt = this.state.reconnectAttempts;
    const baseDelay = this.config.baseDelay * Math.pow(2, Math.min(attempt - 1, 8));
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.min(baseDelay + jitter, this.config.maxDelay);

    this.state.nextReconnectAt = Date.now() + delay;

    logger.info(`Recovery: client '${this.clientKey}' reconnecting in ${delay}ms (attempt ${attempt}/${this.config.maxAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.state.nextReconnectAt = null;

      try {
        await this.rebuild();
      } catch {
        logger.debug("MCP recovery rebuild failed, scheduleReconnect will retry");
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.state.nextReconnectAt = null;
  }
}

export class RecoveryManager {
  private recoveries: Map<string, ClientRecovery> = new Map();

  private globalHandlers: {
    stateChanged?: (oldState: RecoveryPhase, newState: RecoveryPhase, key: string) => void;
    recovered?: (key: string) => void;
    failed?: (key: string, error: string) => void;
  } = {};

  setGlobalHandlers(handlers: {
    stateChanged?: (oldState: RecoveryPhase, newState: RecoveryPhase, key: string) => void;
    recovered?: (key: string) => void;
    failed?: (key: string, error: string) => void;
  }): void {
    this.globalHandlers = handlers;
  }

  async addClient(
    key: string,
    config: MCPClientConfig,
    recoveryConfig?: Partial<RecoveryConfig>,
  ): Promise<EnhancedStatefulClient> {
    const recovery = new ClientRecovery(key, config, recoveryConfig);
    recovery.setEventHandlers({
      stateChanged: (oldState, newState, clientKey) => {
        this.globalHandlers.stateChanged?.(oldState, newState, clientKey);
      },
      recovered: (clientKey) => {
        this.globalHandlers.recovered?.(clientKey);
      },
      failed: (clientKey, error) => {
        this.globalHandlers.failed?.(clientKey, error);
      },
    });

    await recovery.connect();
    recovery.startHealthCheck();

    this.recoveries.set(key, recovery);
    return recovery.getClientOrThrow();
  }

  async removeClient(key: string): Promise<void> {
    const recovery = this.recoveries.get(key);
    if (!recovery) return;

    await recovery.disconnect();
    this.recoveries.delete(key);
  }

  getClient(key: string): EnhancedStatefulClient | null {
    return this.recoveries.get(key)?.getClient() ?? null;
  }

  getRecovery(key: string): ClientRecovery | undefined {
    return this.recoveries.get(key);
  }

  getRecoveryState(key: string): RecoveryState | null {
    return this.recoveries.get(key)?.getState() ?? null;
  }

  async rebuildClient(key: string): Promise<void> {
    const recovery = this.recoveries.get(key);
    if (!recovery) {
      throw new Error(`Recovery: client '${key}' not found`);
    }
    await recovery.rebuild();
  }

  async closeAll(): Promise<void> {
    const keys = [...this.recoveries.keys()];

    await Promise.allSettled(
      keys.map(async (key) => {
        const recovery = this.recoveries.get(key);
        if (recovery) {
          await recovery.disconnect();
        }
      }),
    );

    this.recoveries.clear();
  }

  getStatus(): Record<string, {
    state: RecoveryPhase;
    consecutiveFailures: number;
    totalFailures: number;
    reconnectAttempts: number;
    lastError: string | null;
    lastFailureAt: number | null;
  }> {
    const result: Record<string, {
      state: RecoveryPhase;
      consecutiveFailures: number;
      totalFailures: number;
      reconnectAttempts: number;
      lastError: string | null;
      lastFailureAt: number | null;
    }> = {};

    for (const [key, recovery] of this.recoveries) {
      const state = recovery.getState();
      result[key] = {
        state: state.state,
        consecutiveFailures: state.consecutiveFailures,
        totalFailures: state.totalFailures,
        reconnectAttempts: state.reconnectAttempts,
        lastError: state.lastError,
        lastFailureAt: state.lastFailureAt,
      };
    }

    return result;
  }
}

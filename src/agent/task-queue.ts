import { Semaphore } from "../utils/concurrency.js";
import { logger } from "../utils/logger.js";
import {
  type AgentConcurrencyConfig,
  resolveAgentConcurrencyConfig,
} from "./concurrency.js";

export interface AgentTask<T = unknown> {
  id: string;
  sessionId: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentQueueMetrics {
  maxConcurrent: number;
  available: number;
  waiting: number;
  activeTasks: number;
  totalCompleted: number;
  totalFailed: number;
  totalQueued: number;
}

export class AgentTaskQueue {
  private semaphore: Semaphore;
  private config: AgentConcurrencyConfig;
  private activeTasks: Map<string, AgentTask> = new Map();
  private sessionConcurrency: Map<string, number> = new Map();
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalQueued = 0;

  constructor(config?: Partial<AgentConcurrencyConfig>) {
    this.config = resolveAgentConcurrencyConfig(config);
    this.semaphore = new Semaphore(this.config.maxConcurrent);
  }

  async enqueue<T>(task: {
    id: string;
    sessionId: string;
    execute: () => Promise<T>;
  }): Promise<T> {
    const sessionId = task.sessionId;
    const sessionActive = this.sessionConcurrency.get(sessionId) ?? 0;

    if (sessionActive >= this.config.maxConcurrentPerSession) {
      throw new Error(
        `Session '${sessionId}' has reached max concurrent agent tasks (${this.config.maxConcurrentPerSession})`,
      );
    }

    this.totalQueued++;
    this.sessionConcurrency.set(sessionId, sessionActive + 1);

    const queueTimeout = this.config.queueTimeout;

    return new Promise<T>((resolve, reject) => {
      const agentTask: AgentTask<T> = {
        id: task.id,
        sessionId: task.sessionId,
        execute: task.execute,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      const timeout = setTimeout(() => {
        if (this.activeTasks.has(task.id)) {
          this.removeTask(task.id, task.sessionId);
          reject(new Error(`Agent task '${task.id}' timed out after ${queueTimeout}ms in queue`));
          this.totalFailed++;
        }
      }, queueTimeout);

      this.executeWhenAvailable(agentTask, timeout).catch((error) => {
        this.removeTask(task.id, task.sessionId);
        reject(error);
        this.totalFailed++;
      });
    });
  }

  private async executeWhenAvailable<T>(
    task: AgentTask<T>,
    timeout: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    await this.semaphore.acquire();

    clearTimeout(timeout);

    task.startedAt = Date.now();
    this.activeTasks.set(task.id, task as AgentTask);

    const waitTime = task.startedAt - task.enqueuedAt;
    if (waitTime > 1000) {
      logger.warn(
        `Agent task '${task.id}' waited ${waitTime}ms in queue (concurrency limit: ${this.config.maxConcurrent})`,
      );
    }

    try {
      const result = await task.execute();
      task.completedAt = Date.now();
      task.resolve(result);
      this.totalCompleted++;
    } catch (error) {
      task.reject(error);
      this.totalFailed++;
    } finally {
      this.removeTask(task.id, task.sessionId);
      this.semaphore.release();
    }
  }

  private removeTask(taskId: string, sessionId: string): void {
    this.activeTasks.delete(taskId);
    const sessionActive = this.sessionConcurrency.get(sessionId) ?? 0;
    if (sessionActive <= 1) {
      this.sessionConcurrency.delete(sessionId);
    } else {
      this.sessionConcurrency.set(sessionId, sessionActive - 1);
    }
  }

  getMetrics(): AgentQueueMetrics {
    return {
      maxConcurrent: this.config.maxConcurrent,
      available: this.semaphore.available,
      waiting: this.semaphore.waiting,
      activeTasks: this.activeTasks.size,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalQueued: this.totalQueued,
    };
  }

  updateConfig(config: Partial<AgentConcurrencyConfig>): void {
    const newConfig = resolveAgentConcurrencyConfig(config);
    if (newConfig.maxConcurrent !== this.config.maxConcurrent) {
      this.semaphore = new Semaphore(newConfig.maxConcurrent);
    }
    this.config = newConfig;
    logger.info(
      `Agent concurrency config updated: maxConcurrent=${newConfig.maxConcurrent}, maxConcurrentPerSession=${newConfig.maxConcurrentPerSession}`,
    );
  }

  getConfig(): AgentConcurrencyConfig {
    return { ...this.config };
  }
}

import type {
  CronJob,
  CronJobCreate,
  CronJobUpdate,
  CronJobInfo,
  CronRunStatus,
  Workflow,
  TriggerRule,
  Event,
  EventName,
  EventPayload,
} from "./types.js";
import { CronScheduler, computeNextRun } from "./cron-scheduler.js";
import { EventBus } from "./event-bus.js";
import { WorkflowEngine, type WorkflowExecutor } from "./workflow-engine.js";
import { TriggerManager, type TriggerAction } from "./trigger-manager.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export type AutomationDeps = {
  chat: (sessionId: string, text: string) => Promise<{ response?: string } | null>;
  sendChannelMessage?: (channelId: string, toHandle: string, text: string) => Promise<void>;
};

export class AutomationManager {
  private cronScheduler: CronScheduler;
  private eventBus: EventBus;
  private workflowEngine: WorkflowEngine;
  private triggerManager: TriggerManager;
  private deps: AutomationDeps;
  private running = false;

  constructor(deps: AutomationDeps) {
    this.deps = deps;

    this.eventBus = new EventBus({ maxHistorySize: 1000, historyEnabled: true });

    this.cronScheduler = new CronScheduler(async (job) => {
      return this.executeCronJob(job);
    });

    const workflowExecutor: WorkflowExecutor = async (node, context) => {
      return this.executeWorkflowNode(node, context);
    };
    this.workflowEngine = new WorkflowEngine(workflowExecutor);

    const triggerAction: TriggerAction = async (rule, event) => {
      return this.executeTriggerAction(rule, event);
    };
    this.triggerManager = new TriggerManager(this.eventBus, triggerAction);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.cronScheduler.start();
    this.triggerManager.start();

    await this.emit("system.started", { component: "automation" }, "automation");

    logger.info("Automation manager started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.cronScheduler.stop();
    this.triggerManager.stop();
    this.eventBus.removeAllListeners();

    await this.emit("system.stopped", { component: "automation" }, "automation");

    logger.info("Automation manager stopped");
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getCronScheduler(): CronScheduler {
    return this.cronScheduler;
  }

  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  getTriggerManager(): TriggerManager {
    return this.triggerManager;
  }

  async emit(eventName: EventName, payload: EventPayload, source = "system"): Promise<void> {
    await this.eventBus.emit(eventName, payload, source);
  }

  createCronJob(input: CronJobCreate): CronJob {
    const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const job: CronJob = {
      id,
      name: input.name,
      schedule: input.schedule,
      prompt: input.prompt,
      channelId: input.channelId ?? null,
      sessionId: input.sessionId ?? null,
      enabled: input.enabled ?? true,
      deleteAfterRun: input.deleteAfterRun ?? false,
      state: {
        nextRunAt: computeNextRun(input.schedule, now),
        runningAt: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastError: null,
        lastDurationMs: null,
        consecutiveErrors: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.cronScheduler.addJob(job);
    return job;
  }

  updateCronJob(jobId: string, updates: CronJobUpdate): CronJob | null {
    const job = this.cronScheduler.getJob(jobId);
    if (!job) return null;

    if (updates.name !== undefined) job.name = updates.name;
    if (updates.schedule !== undefined) {
      job.schedule = updates.schedule;
      job.state.nextRunAt = computeNextRun(updates.schedule, Date.now());
    }
    if (updates.prompt !== undefined) job.prompt = updates.prompt;
    if (updates.channelId !== undefined) job.channelId = updates.channelId;
    if (updates.sessionId !== undefined) job.sessionId = updates.sessionId;
    if (updates.enabled !== undefined) {
      job.enabled = updates.enabled;
      if (updates.enabled) {
        job.state.nextRunAt = computeNextRun(job.schedule, Date.now());
      } else {
        job.state.nextRunAt = null;
      }
    }
    if (updates.deleteAfterRun !== undefined) job.deleteAfterRun = updates.deleteAfterRun;

    job.updatedAt = Date.now();
    this.cronScheduler.updateJob(jobId, job);
    return job;
  }

  deleteCronJob(jobId: string): boolean {
    return this.cronScheduler.removeJob(jobId);
  }

  getCronJob(jobId: string): CronJob | undefined {
    return this.cronScheduler.getJob(jobId);
  }

  listCronJobs(): CronJobInfo[] {
    return this.cronScheduler.getJobInfos();
  }

  async runCronJobNow(jobId: string) {
    return this.cronScheduler.runJobNow(jobId);
  }

  addWorkflow(workflow: Workflow): void {
    this.workflowEngine.addWorkflow(workflow);
  }

  removeWorkflow(workflowId: string): boolean {
    return this.workflowEngine.removeWorkflow(workflowId);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflowEngine.getWorkflow(workflowId);
  }

  listWorkflows(): Workflow[] {
    return this.workflowEngine.listWorkflows();
  }

  async runWorkflow(workflowId: string, variables?: Record<string, unknown>) {
    return this.workflowEngine.runWorkflow(workflowId, variables);
  }

  addTriggerRule(rule: TriggerRule): void {
    this.triggerManager.addRule(rule);
  }

  removeTriggerRule(ruleId: string): boolean {
    return this.triggerManager.removeRule(ruleId);
  }

  getTriggerRule(ruleId: string): TriggerRule | undefined {
    return this.triggerManager.getRule(ruleId);
  }

  listTriggerRules(): TriggerRule[] {
    return this.triggerManager.listRules();
  }

  private async executeCronJob(job: CronJob): Promise<{ status: CronRunStatus; error?: string }> {
    await this.emit("cron.job_started", { jobId: job.id, jobName: job.name }, "cron");

    try {
      const sessionId = job.sessionId || `cron:${job.id}`;
      const result = await this.deps.chat(sessionId, job.prompt);

      if (result?.response && job.channelId && this.deps.sendChannelMessage) {
        try {
          await this.deps.sendChannelMessage(job.channelId, sessionId, result.response);
        } catch (error) {
          logger.warn(`Cron job ${job.id} channel delivery failed: ${error}`);
        }
      }

      await this.emit("cron.job_completed", {
        jobId: job.id,
        jobName: job.name,
        responseLength: result?.response?.length ?? 0,
      }, "cron");

      return { status: "ok" };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await this.emit("cron.job_failed", {
        jobId: job.id,
        jobName: job.name,
        error: errMsg,
      }, "cron");

      return { status: "error", error: errMsg };
    }
  }

  private async executeWorkflowNode(
    node: import("./types.js").WorkflowNode,
    context: import("./workflow-engine.js").WorkflowRunContext,
  ): Promise<unknown> {
    switch (node.type) {
      case "prompt": {
        const text = typeof node.config.text === "string"
          ? node.config.text
          : String(node.config.text ?? "");
        const sessionId = typeof node.config.sessionId === "string"
          ? node.config.sessionId
          : context.workflowId;
        const result = await this.deps.chat(sessionId, text);
        return result?.response ?? null;
      }

      case "tool": {
        const toolName = typeof node.config.toolName === "string"
          ? node.config.toolName
          : "";
        const args = typeof node.config.args === "object" && node.config.args !== null
          ? node.config.args
          : {};
        return { toolName, args, status: "simulated" };
      }

      case "condition": {
        const expression = typeof node.config.expression === "string"
          ? node.config.expression
          : "true";
        try {
          const fn = new Function("context", `return (${expression})`);
          return Boolean(fn(Object.fromEntries(context.nodeResults)));
        } catch {
          return false;
        }
      }

      case "parallel":
        return { parallel: true };

      case "delay":
        return { delay: true };

      default:
        return null;
    }
  }

  private async executeTriggerAction(rule: TriggerRule, event: Event): Promise<void> {
    logger.info(`Trigger rule fired: ${rule.name} (${rule.id}), event: ${event.name}`);

    switch (rule.action) {
      case "prompt": {
        const sessionId = typeof rule.actionConfig.sessionId === "string"
          ? rule.actionConfig.sessionId
          : `trigger:${rule.id}`;
        const text = typeof rule.actionConfig.prompt === "string"
          ? rule.actionConfig.prompt
          : `Event ${event.name} triggered`;
        await this.deps.chat(sessionId, text);
        break;
      }

      case "workflow": {
        const workflowId = typeof rule.actionConfig.workflowId === "string"
          ? rule.actionConfig.workflowId
          : "";
        if (workflowId) {
          await this.workflowEngine.runWorkflow(workflowId, { triggerEvent: event });
        }
        break;
      }

      case "tool": {
        const toolName = typeof rule.actionConfig.toolName === "string"
          ? rule.actionConfig.toolName
          : "";
        logger.info(`Trigger tool action: ${toolName}`);
        break;
      }
    }
  }
}

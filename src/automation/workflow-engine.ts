import type {
  Workflow,
  WorkflowNode,
  WorkflowRun,
} from "./types.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export type WorkflowExecutor = (
  node: WorkflowNode,
  context: WorkflowRunContext,
) => Promise<unknown>;

export interface WorkflowRunContext {
  workflowId: string;
  runId: string;
  variables: Record<string, unknown>;
  nodeResults: Map<string, unknown>;
  getNodeResult(nodeId: string): unknown;
  setVariable(key: string, value: unknown): void;
  getVariable(key: string): unknown;
}

class RunContextImpl implements WorkflowRunContext {
  workflowId: string;
  runId: string;
  variables: Record<string, unknown>;
  nodeResults: Map<string, unknown>;

  constructor(workflowId: string, runId: string, variables: Record<string, unknown>) {
    this.workflowId = workflowId;
    this.runId = runId;
    this.variables = { ...variables };
    this.nodeResults = new Map();
  }

  getNodeResult(nodeId: string): unknown {
    return this.nodeResults.get(nodeId);
  }

  setVariable(key: string, value: unknown): void {
    this.variables[key] = value;
  }

  getVariable(key: string): unknown {
    return this.variables[key];
  }
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private activeRuns: Map<string, WorkflowRun> = new Map();
  private executor: WorkflowExecutor;
  private runCounter = 0;

  constructor(executor: WorkflowExecutor) {
    this.executor = executor;
  }

  addWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
    logger.info(`Workflow added: ${workflow.name} (${workflow.id})`);
  }

  removeWorkflow(workflowId: string): boolean {
    const removed = this.workflows.delete(workflowId);
    if (removed) {
      logger.info(`Workflow removed: ${workflowId}`);
    }
    return removed;
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  updateWorkflow(workflowId: string, updates: Partial<Workflow>): Workflow | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    Object.assign(workflow, updates, { updatedAt: Date.now() });
    return workflow;
  }

  async runWorkflow(workflowId: string, variables?: Record<string, unknown>): Promise<WorkflowRun> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${workflowId}`);
    }

    const runId = `wfr_${++this.runCounter}_${Date.now()}`;
    const context = new RunContextImpl(workflowId, runId, {
      ...workflow.variables,
      ...variables,
    });

    const run: WorkflowRun = {
      id: runId,
      workflowId,
      status: "running",
      currentNodeId: null,
      nodeStates: new Map(),
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      results: new Map(),
    };

    for (const node of workflow.nodes) {
      run.nodeStates.set(node.id, "pending");
    }

    this.activeRuns.set(runId, run);
    logger.info(`Workflow run started: ${workflow.name} (${runId})`);

    try {
      const startNodes = this.findStartNodes(workflow);
      if (startNodes.length === 0) {
        throw new Error("No start node found in workflow");
      }

      await this.executeNodes(workflow, startNodes, run, context);

      run.status = "completed";
      run.endedAt = Date.now();
      logger.info(`Workflow run completed: ${runId}`);
    } catch (error) {
      run.status = "failed";
      run.endedAt = Date.now();
      run.error = formatErrorMessage(error);
      logger.error(`Workflow run failed: ${runId} - ${run.error}`);
    } finally {
      run.results = new Map(context.nodeResults);
    }

    return run;
  }

  cancelRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== "running") return false;

    run.status = "cancelled";
    run.endedAt = Date.now();
    logger.info(`Workflow run cancelled: ${runId}`);
    return true;
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.activeRuns.get(runId);
  }

  listActiveRuns(): WorkflowRun[] {
    return Array.from(this.activeRuns.values()).filter((r) => r.status === "running");
  }

  private findStartNodes(workflow: Workflow): WorkflowNode[] {
    const targetIds = new Set<string>();
    for (const edge of workflow.edges) {
      targetIds.add(edge.to);
    }
    return workflow.nodes.filter((n) => !targetIds.has(n.id));
  }

  private getNextNodes(workflow: Workflow, nodeId: string, result: unknown): WorkflowNode[] {
    const edges = workflow.edges.filter((e) => e.from === nodeId);

    const matchingEdges = edges.filter((edge) => {
      if (!edge.condition) return true;
      return this.evaluateCondition(edge.condition, result);
    });

    const nextIds = new Set(matchingEdges.map((e) => e.to));
    return workflow.nodes.filter((n) => nextIds.has(n.id));
  }

  private evaluateCondition(condition: string, _result: unknown): boolean {
    try {
      if (condition === "success") return true;
      if (condition === "failure") return false;
      return condition === "true";
    } catch {
      return false;
    }
  }

  private async executeNodes(
    workflow: Workflow,
    nodes: WorkflowNode[],
    run: WorkflowRun,
    context: RunContextImpl,
  ): Promise<void> {
    if (run.status !== "running") return;

    const parallel = nodes.length > 1;

    if (parallel) {
      const results = await Promise.allSettled(
        nodes.map((node) => this.executeSingleNode(workflow, node, run, context)),
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        const n = nodes[i];
        if (r.status === "rejected" && n?.onError === "stop") {
          throw (r as PromiseRejectedResult).reason;
        }
      }

      const nextNodes: WorkflowNode[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        const r = results[i];
        const nodeResult = r?.status === "fulfilled" ? r.value : undefined;
        const nexts = this.getNextNodes(workflow, node.id, nodeResult);
        nextNodes.push(...nexts);
      }

      if (nextNodes.length > 0) {
        await this.executeNodes(workflow, nextNodes, run, context);
      }
    } else {
      for (const node of nodes) {
        if (run.status !== "running") return;

        const result = await this.executeSingleNode(workflow, node, run, context);

        const nextNodes = this.getNextNodes(workflow, node.id, result);
        if (nextNodes.length > 0) {
          await this.executeNodes(workflow, nextNodes, run, context);
        }
      }
    }
  }

  private async executeSingleNode(
    _workflow: Workflow,
    node: WorkflowNode,
    run: WorkflowRun,
    context: RunContextImpl,
  ): Promise<unknown> {
    if (run.status !== "running") return undefined;

    run.currentNodeId = node.id;
    run.nodeStates.set(node.id, "running");

    if (node.type === "delay") {
      const delayMs = typeof node.config.delayMs === "number" ? node.config.delayMs : 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      run.nodeStates.set(node.id, "completed");
      context.nodeResults.set(node.id, { delayed: delayMs });
      return { delayed: delayMs };
    }

    const maxRetries = node.maxRetries ?? 0;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        const result = await this.executor(node, context);
        run.nodeStates.set(node.id, "completed");
        context.nodeResults.set(node.id, result);
        return result;
      } catch (error) {
        attempts++;
        const errMsg = formatErrorMessage(error);

        if (attempts <= maxRetries) {
          logger.warn(`Workflow node ${node.id} retry ${attempts}/${maxRetries}: ${errMsg}`);
          continue;
        }

        run.nodeStates.set(node.id, "failed");

        if (node.onError === "skip") {
          logger.warn(`Workflow node ${node.id} skipped after error: ${errMsg}`);
          context.nodeResults.set(node.id, { error: errMsg, skipped: true });
          return { error: errMsg, skipped: true };
        }

        throw error;
      }
    }

    return undefined;
  }
}

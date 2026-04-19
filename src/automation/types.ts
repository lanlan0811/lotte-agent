export type CronScheduleKind = "cron" | "every" | "at";

export type CronSchedule =
  | { kind: "cron"; expr: string; tz?: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "at"; at: number };

export type CronRunStatus = "ok" | "error" | "skipped";

export interface CronJobState {
  nextRunAt: number | null;
  runningAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: CronRunStatus | null;
  lastError: string | null;
  lastDurationMs: number | null;
  consecutiveErrors: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: CronSchedule;
  prompt: string;
  channelId: string | null;
  sessionId: string | null;
  enabled: boolean;
  deleteAfterRun: boolean;
  state: CronJobState;
  createdAt: number;
  updatedAt: number;
}

export interface CronJobCreate {
  name: string;
  schedule: CronSchedule;
  prompt: string;
  channelId?: string;
  sessionId?: string;
  enabled?: boolean;
  deleteAfterRun?: boolean;
}

export interface CronJobUpdate {
  name?: string;
  schedule?: CronSchedule;
  prompt?: string;
  channelId?: string | null;
  sessionId?: string | null;
  enabled?: boolean;
  deleteAfterRun?: boolean;
}

export interface CronJobInfo {
  id: string;
  name: string;
  schedule: CronSchedule;
  prompt: string;
  channelId: string | null;
  sessionId: string | null;
  enabled: boolean;
  deleteAfterRun: boolean;
  state: CronJobState;
  createdAt: number;
  updatedAt: number;
}

export interface CronRunResult {
  jobId: string;
  status: CronRunStatus;
  error?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export type WorkflowNodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface WorkflowNode {
  id: string;
  name: string;
  type: "prompt" | "tool" | "condition" | "parallel" | "delay";
  config: Record<string, unknown>;
  next: string[];
  onError?: "stop" | "skip" | "retry";
  retryCount?: number;
  maxRetries?: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentNodeId: string | null;
  nodeStates: Map<string, WorkflowNodeStatus>;
  startedAt: number;
  endedAt: number | null;
  error: string | null;
  results: Map<string, unknown>;
}

export type EventName =
  | "agent.message"
  | "agent.tool_call"
  | "agent.error"
  | "channel.message"
  | "channel.connected"
  | "channel.disconnected"
  | "cron.job_started"
  | "cron.job_completed"
  | "cron.job_failed"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "config.changed"
  | "plugin.loaded"
  | "plugin.unloaded"
  | "system.started"
  | "system.stopped"
  | string;

export interface EventPayload {
  [key: string]: unknown;
}

export interface Event {
  id: string;
  name: EventName;
  payload: EventPayload;
  timestamp: number;
  source: string;
}

export type EventHandler = (event: Event) => void | Promise<void>;

export interface TriggerRule {
  id: string;
  name: string;
  eventName: EventName;
  condition?: string;
  action: "prompt" | "workflow" | "tool";
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

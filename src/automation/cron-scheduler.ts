import { Cron } from "croner";
import type { CronSchedule, CronJob } from "./types.js";
import { logger } from "../utils/logger.js";

const MIN_REFIRE_GAP_MS = 2000;
const ERROR_BACKOFF_BASE_MS = 5000;
const MAX_ERROR_BACKOFF_MS = 3600000;
const MAX_CONSECUTIVE_ERRORS = 10;

const CRON_EVAL_CACHE_MAX = 512;
const cronEvalCache = new Map<string, Cron>();

const DEFAULT_TOP_OF_HOUR_STAGGER_MS = 5 * 60 * 1000;

function resolveCronTimezone(tz?: string): string {
  const trimmed = (tz ?? "").trim();
  if (trimmed) return trimmed;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCachedCron(expr: string, timezone: string): Cron {
  const key = `${timezone}\u0000${expr}`;
  const cached = cronEvalCache.get(key);
  if (cached) return cached;

  if (cronEvalCache.size >= CRON_EVAL_CACHE_MAX) {
    const oldest = cronEvalCache.keys().next().value;
    if (oldest) cronEvalCache.delete(oldest);
  }

  const next = new Cron(expr, { timezone, catch: false });
  cronEvalCache.set(key, next);
  return next;
}

function parseCronFields(expr: string): string[] {
  return expr.trim().split(/\s+/).filter(Boolean);
}

function isRecurringTopOfHourCronExpr(expr: string): boolean {
  const fields = parseCronFields(expr);
  if (fields.length === 5) {
    const [minuteField, hourField] = fields;
    return minuteField === "0" && hourField!.includes("*");
  }
  if (fields.length === 6) {
    const [secondField, minuteField, hourField] = fields;
    return secondField === "0" && minuteField === "0" && hourField!.includes("*");
  }
  return false;
}

function normalizeCronStaggerMs(raw: unknown): number | undefined {
  const numeric =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.floor(numeric));
}

function resolveDefaultCronStaggerMs(expr: string): number | undefined {
  return isRecurringTopOfHourCronExpr(expr) ? DEFAULT_TOP_OF_HOUR_STAGGER_MS : undefined;
}

function resolveCronStaggerMs(schedule: Extract<CronSchedule, { kind: "cron" }>): number {
  const explicit = normalizeCronStaggerMs(
    (schedule as Record<string, unknown>).staggerMs,
  );
  if (explicit !== undefined) return explicit;
  const expr = (schedule as { expr?: unknown }).expr;
  const cronExpr = typeof expr === "string" ? expr : "";
  return resolveDefaultCronStaggerMs(cronExpr) ?? 0;
}

function computeNextRun(schedule: CronSchedule, nowMs: number): number | null {
  if (schedule.kind === "at") {
    return schedule.at > nowMs ? schedule.at : null;
  }

  if (schedule.kind === "every") {
    const everyMs = Math.max(1, schedule.everyMs);
    const anchor = schedule.anchorMs ?? nowMs;
    if (nowMs < anchor) return anchor;
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    return anchor + steps * everyMs;
  }

  if (schedule.kind === "cron") {
    try {
      const tz = resolveCronTimezone(schedule.tz);
      const cron = resolveCachedCron(schedule.expr, tz);

      let next = cron.nextRun(new Date(nowMs));
      if (!next) return null;
      let nextMs = next.getTime();
      if (!Number.isFinite(nextMs)) return null;

      if (nextMs <= nowMs) {
        const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
        const retry = cron.nextRun(new Date(nextSecondMs));
        if (retry) {
          const retryMs = retry.getTime();
          if (Number.isFinite(retryMs) && retryMs > nowMs) {
            nextMs = retryMs;
          } else {
            const tomorrowMs = new Date(nowMs).setUTCHours(24, 0, 0, 0);
            const retry2 = cron.nextRun(new Date(tomorrowMs));
            if (retry2) {
              const retry2Ms = retry2.getTime();
              if (Number.isFinite(retry2Ms) && retry2Ms > nowMs) return retry2Ms;
            }
            return null;
          }
        } else {
          return null;
        }
      }

      const stagger = resolveCronStaggerMs(schedule);
      if (stagger > 0) {
        nextMs += stagger;
      }

      return nextMs;
    } catch (error) {
      logger.error(`Cron expression error: ${error}`);
      return null;
    }
  }

  return null;
}

function computePreviousRun(schedule: CronSchedule, nowMs: number): number | null {
  if (schedule.kind !== "cron") return null;
  try {
    const tz = resolveCronTimezone(schedule.tz);
    const cron = resolveCachedCron(schedule.expr, tz);
    const nextMs = cron.nextRun(new Date(nowMs))?.getTime();
    if (nextMs === undefined || !Number.isFinite(nextMs)) return null;
    const prev = cron.previousRun();
    if (!prev) return null;
    const prevMs = prev.getTime();
    return Number.isFinite(prevMs) && prevMs < nowMs ? prevMs : null;
  } catch {
    return null;
  }
}

function errorBackoffMs(consecutiveErrors: number): number {
  const backoff = ERROR_BACKOFF_BASE_MS * Math.pow(2, Math.min(consecutiveErrors - 1, 10));
  return Math.min(backoff, MAX_ERROR_BACKOFF_MS);
}

export type CronExecutor = (job: CronJob) => Promise<{ status: "ok" | "error" | "skipped"; error?: string }>;

export class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private executor: CronExecutor;
  private running = false;
  private activeJobs: Set<string> = new Set();

  constructor(executor: CronExecutor) {
    this.executor = executor;
  }

  addJob(job: CronJob): void {
    if (!job.state.nextRunAt) {
      job.state.nextRunAt = computeNextRun(job.schedule, Date.now());
    }
    this.jobs.set(job.id, job);
    logger.info(`Cron job added: ${job.name} (${job.id}), nextRun: ${job.state.nextRunAt ? new Date(job.state.nextRunAt).toISOString() : "none"}`);
    this.rearmTimer();
  }

  removeJob(jobId: string): boolean {
    const removed = this.jobs.delete(jobId);
    if (removed) {
      logger.info(`Cron job removed: ${jobId}`);
      this.rearmTimer();
    }
    return removed;
  }

  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  updateJob(jobId: string, updates: Partial<CronJob>): CronJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    Object.assign(job, updates, { updatedAt: Date.now() });

    if (updates.schedule) {
      job.state.nextRunAt = computeNextRun(job.schedule, Date.now());
    }

    if (updates.enabled === true && !job.state.nextRunAt) {
      job.state.nextRunAt = computeNextRun(job.schedule, Date.now());
    }

    if (updates.enabled === false) {
      job.state.nextRunAt = null;
    }

    this.rearmTimer();
    return job;
  }

  async runJobNow(jobId: string): Promise<{ status: "ok" | "error" | "skipped"; error?: string } | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return this.executeJob(job);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info("Cron scheduler started");
    this.rearmTimer();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("Cron scheduler stopped");
  }

  private rearmTimer(): void {
    if (!this.running) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let earliest: number | null = null;
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (!job.state.nextRunAt) continue;
      if (this.activeJobs.has(job.id)) continue;
      if (earliest === null || job.state.nextRunAt < earliest) {
        earliest = job.state.nextRunAt;
      }
    }

    if (earliest === null) return;

    const delay = Math.max(0, earliest - Date.now());
    const clampedDelay = Math.min(delay, 60000);

    this.timer = setTimeout(() => this.onTimer(), clampedDelay);
    if (this.timer && this.timer.unref) {
      this.timer.unref();
    }
  }

  private async onTimer(): Promise<void> {
    this.timer = null;
    if (!this.running) return;

    const now = Date.now();
    const due: CronJob[] = [];

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (!job.state.nextRunAt) continue;
      if (this.activeJobs.has(job.id)) continue;
      if (job.state.nextRunAt <= now) {
        due.push(job);
      }
    }

    for (const job of due) {
      this.executeJob(job).catch((err) => {
        logger.error(`Cron job execution error for ${job.id}: ${err}`);
      });
    }

    this.rearmTimer();
  }

  private async executeJob(job: CronJob): Promise<{ status: "ok" | "error" | "skipped"; error?: string }> {
    if (this.activeJobs.has(job.id)) {
      return { status: "skipped", error: "Job already running" };
    }

    this.activeJobs.add(job.id);
    const startedAt = Date.now();
    job.state.runningAt = startedAt;

    try {
      const result = await this.executor(job);
      const endedAt = Date.now();

      job.state.runningAt = null;
      job.state.lastRunAt = startedAt;
      job.state.lastRunStatus = result.status;
      job.state.lastDurationMs = endedAt - startedAt;
      job.state.lastError = result.error ?? null;
      job.updatedAt = endedAt;

      if (result.status === "error") {
        job.state.consecutiveErrors++;
        if (job.state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          job.enabled = false;
          job.state.nextRunAt = null;
          logger.warn(`Cron job ${job.id} disabled after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
        } else {
          const backoff = errorBackoffMs(job.state.consecutiveErrors);
          const normalNext = computeNextRun(job.schedule, endedAt);
          const backoffNext = endedAt + backoff;
          job.state.nextRunAt = normalNext !== null
            ? Math.max(normalNext, backoffNext)
            : backoffNext;
        }
      } else {
        job.state.consecutiveErrors = 0;

        if (job.schedule.kind === "at") {
          if (job.deleteAfterRun && result.status === "ok") {
            this.removeJob(job.id);
            return result;
          }
          job.enabled = false;
          job.state.nextRunAt = null;
        } else {
          const nextRun = computeNextRun(job.schedule, endedAt);
          if (nextRun !== null) {
            const minNext = endedAt + MIN_REFIRE_GAP_MS;
            job.state.nextRunAt = Math.max(nextRun, minNext);
          } else {
            job.state.nextRunAt = null;
          }
        }
      }

      logger.info(`Cron job ${job.name} (${job.id}) completed: ${result.status}${result.error ? ` - ${result.error}` : ""}`);
      return result;
    } catch (error) {
      const endedAt = Date.now();
      const errMsg = error instanceof Error ? error.message : String(error);

      job.state.runningAt = null;
      job.state.lastRunAt = startedAt;
      job.state.lastRunStatus = "error";
      job.state.lastDurationMs = endedAt - startedAt;
      job.state.lastError = errMsg;
      job.state.consecutiveErrors++;
      job.updatedAt = endedAt;

      const backoff = errorBackoffMs(job.state.consecutiveErrors);
      const normalNext = computeNextRun(job.schedule, endedAt);
      const backoffNext = endedAt + backoff;
      job.state.nextRunAt = normalNext !== null
        ? Math.max(normalNext, backoffNext)
        : backoffNext;

      logger.error(`Cron job ${job.name} (${job.id}) error: ${errMsg}`);
      return { status: "error", error: errMsg };
    } finally {
      this.activeJobs.delete(job.id);
      this.rearmTimer();
    }
  }

  recomputeNextRuns(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      job.state.nextRunAt = computeNextRun(job.schedule, now);
    }
    this.rearmTimer();
  }

  getJobInfos(): CronJob[] {
    return Array.from(this.jobs.values());
  }
}

export { computeNextRun, computePreviousRun, errorBackoffMs, resolveCronStaggerMs, isRecurringTopOfHourCronExpr };

export function clearCronEvalCacheForTest(): void {
  cronEvalCache.clear();
}

export function getCronEvalCacheSizeForTest(): number {
  return cronEvalCache.size;
}

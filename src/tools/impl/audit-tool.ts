import { z } from "zod";
import type { ToolDefinition } from "../tool-registry.js";
import { logger } from "../../utils/logger.js";

export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  toolName: string;
  action: string;
  args: Record<string, unknown>;
  result: "success" | "failure" | "denied";
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface AuditLogConfig {
  maxEntries: number;
  persistToDisk: boolean;
  logDir: string;
}

const DEFAULT_AUDIT_CONFIG: AuditLogConfig = {
  maxEntries: 10000,
  persistToDisk: true,
  logDir: "./data/audit",
};

export const auditQuerySchema = z.object({
  sessionId: z.string().optional().describe("Filter by session ID"),
  toolName: z.string().optional().describe("Filter by tool name"),
  action: z.string().optional().describe("Filter by action type"),
  result: z.enum(["success", "failure", "denied"]).optional().describe("Filter by result"),
  startTime: z.number().optional().describe("Start timestamp filter"),
  endTime: z.number().optional().describe("End timestamp filter"),
  limit: z.number().int().min(1).max(100).optional().default(20).describe("Maximum results to return"),
  offset: z.number().int().min(0).optional().default(0).describe("Offset for pagination"),
});

export type AuditQueryArgs = z.infer<typeof auditQuerySchema>;

export class AuditLog {
  private entries: AuditEntry[] = [];
  private config: AuditLogConfig;
  private idCounter = 0;

  constructor(config?: Partial<AuditLogConfig>) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
  }

  record(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
    const fullEntry: AuditEntry = {
      id: `audit_${Date.now()}_${++this.idCounter}`,
      timestamp: Date.now(),
      ...entry,
    };

    this.entries.push(fullEntry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    logger.debug(`Audit: ${entry.toolName} ${entry.action} -> ${entry.result}`);

    return fullEntry;
  }

  query(filter: Partial<AuditEntry & { limit?: number; offset?: number; startTime?: number; endTime?: number }>): AuditEntry[] {
    let results = [...this.entries];

    if (filter.sessionId) {
      results = results.filter((e) => e.sessionId === filter.sessionId);
    }

    if (filter.toolName) {
      results = results.filter((e) => e.toolName === filter.toolName);
    }

    if (filter.action) {
      results = results.filter((e) => e.action === filter.action);
    }

    if (filter.result) {
      results = results.filter((e) => e.result === filter.result);
    }

    if (filter.startTime) {
      results = results.filter((e) => e.timestamp >= (filter.startTime ?? 0));
    }

    if (filter.endTime) {
      results = results.filter((e) => e.timestamp <= (filter.endTime ?? Infinity));
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 20;

    return results.slice(offset, offset + limit);
  }

  getStats(): { total: number; byResult: Record<string, number>; byTool: Record<string, number> } {
    const byResult: Record<string, number> = {};
    const byTool: Record<string, number> = {};

    for (const entry of this.entries) {
      byResult[entry.result] = (byResult[entry.result] ?? 0) + 1;
      byTool[entry.toolName] = (byTool[entry.toolName] ?? 0) + 1;
    }

    return { total: this.entries.length, byResult, byTool };
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}

const auditLog = new AuditLog();

export const auditQueryTool: ToolDefinition = {
  name: "audit_query",
  description:
    "Query the audit log for tool execution history. Supports filtering by session, tool name, action, result, and time range.",
  category: "system",
  parameters: auditQuerySchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = auditQuerySchema.parse(args);

    const results = auditLog.query({
      sessionId: parsed.sessionId,
      toolName: parsed.toolName,
      action: parsed.action,
      result: parsed.result,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    if (results.length === 0) {
      return "No audit log entries found matching the query.";
    }

    const lines = results.map((entry) => {
      const time = new Date(entry.timestamp).toISOString();
      const duration = `${entry.durationMs}ms`;
      return `[${time}] ${entry.toolName} ${entry.action} -> ${entry.result} (${duration}) session=${entry.sessionId}`;
    });

    const stats = auditLog.getStats();
    const header = `Audit Log Query Results (${results.length} of ${stats.total} total entries)`;

    return `${header}\n\n${lines.join("\n")}`;
  },
};

export const auditStatsTool: ToolDefinition = {
  name: "audit_stats",
  description: "Get statistics about the audit log, including counts by result and tool name.",
  category: "system",
  parameters: z.object({}),
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(): Promise<string> {
    const stats = auditLog.getStats();

    const lines = [
      `Audit Log Statistics`,
      `Total entries: ${stats.total}`,
      ``,
      `By result:`,
    ];

    for (const [result, count] of Object.entries(stats.byResult).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${result}: ${count}`);
    }

    lines.push("", "By tool:");
    for (const [tool, count] of Object.entries(stats.byTool).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${tool}: ${count}`);
    }

    return lines.join("\n");
  },
};

export { auditLog };

import { z } from "zod";
import type { ToolDefinition } from "../tool-registry.js";
import { AuditLog } from "../../audit/logger.js";
import type { AuditEntry, AuditLogConfig } from "../../audit/logger.js";

export type { AuditEntry, AuditLogConfig };

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

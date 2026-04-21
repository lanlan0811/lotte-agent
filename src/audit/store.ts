import type { Database } from "../db/database.js";
import type { AuditEntry } from "./logger.js";
import { logger } from "../utils/logger.js";

export class AuditStore {
  private db: Database | null = null;

  attach(db: Database): void {
    this.db = db;
  }

  detach(): void {
    this.db = null;
  }

  persist(entry: AuditEntry): void {
    if (!this.db) return;

    try {
      const db = this.db.getDb();
      db.prepare(`
        INSERT INTO audit_logs (log_id, event_type, session_id, tool_name, input_json, output_json, approved, user_id, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        entry.action,
        entry.sessionId,
        entry.toolName,
        JSON.stringify(entry.args),
        entry.result,
        entry.result === "success" ? 1 : 0,
        null,
        entry.result === "failure" ? (entry.metadata?.error as string ?? null) : null,
        entry.timestamp,
      );
    } catch (error) {
      logger.debug(`Audit persist failed: ${error}`);
    }
  }

  queryFromDb(filter: {
    eventType?: string;
    sessionId?: string;
    toolName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): AuditEntry[] {
    if (!this.db) return [];

    try {
      const db = this.db.getDb();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter.eventType) {
        conditions.push("event_type = ?");
        params.push(filter.eventType);
      }
      if (filter.sessionId) {
        conditions.push("session_id = ?");
        params.push(filter.sessionId);
      }
      if (filter.toolName) {
        conditions.push("tool_name = ?");
        params.push(filter.toolName);
      }
      if (filter.startTime) {
        conditions.push("created_at >= ?");
        params.push(filter.startTime);
      }
      if (filter.endTime) {
        conditions.push("created_at <= ?");
        params.push(filter.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filter.limit ?? 20;
      const offset = filter.offset ?? 0;

      const rows = db.prepare(`
        SELECT * FROM audit_logs ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Array<Record<string, unknown>>;

      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      logger.debug(`Audit DB query failed: ${error}`);
      return [];
    }
  }

  getStatsFromDb(): { total: number; byEventType: Record<string, number>; byTool: Record<string, number> } {
    if (!this.db) return { total: 0, byEventType: {}, byTool: {} };

    try {
      const db = this.db.getDb();

      const totalRow = db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number };
      const total = totalRow.count;

      const eventTypeRows = db.prepare(
        "SELECT event_type, COUNT(*) as count FROM audit_logs GROUP BY event_type",
      ).all() as Array<{ event_type: string; count: number }>;
      const byEventType: Record<string, number> = {};
      for (const row of eventTypeRows) {
        byEventType[row.event_type] = row.count;
      }

      const toolRows = db.prepare(
        "SELECT tool_name, COUNT(*) as count FROM audit_logs GROUP BY tool_name",
      ).all() as Array<{ tool_name: string; count: number }>;
      const byTool: Record<string, number> = {};
      for (const row of toolRows) {
        byTool[row.tool_name] = row.count;
      }

      return { total, byEventType, byTool };
    } catch (error) {
      logger.debug(`Audit DB stats failed: ${error}`);
      return { total: 0, byEventType: {}, byTool: {} };
    }
  }

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.log_id as string,
      timestamp: row.created_at as number,
      sessionId: (row.session_id as string) ?? "",
      toolName: (row.tool_name as string) ?? "",
      action: (row.event_type as string) ?? "",
      args: row.input_json ? JSON.parse(row.input_json as string) : {},
      result: row.approved === 1 ? "success" : "failure",
      durationMs: 0,
      metadata: row.error ? { error: row.error as string } : undefined,
    };
  }
}

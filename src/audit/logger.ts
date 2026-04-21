import { logger } from "../utils/logger.js";

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

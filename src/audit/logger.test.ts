import { describe, it, expect, beforeEach } from "vitest";
import { AuditLog } from "../audit/logger.js";

describe("AuditLog", () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    auditLog = new AuditLog();
  });

  it("should record an entry", () => {
    const entry = auditLog.record({
      sessionId: "s1",
      toolName: "exec",
      action: "execute",
      args: { command: "ls" },
      result: "success",
      durationMs: 100,
    });

    expect(entry.id).toBeDefined();
    expect(entry.id).toMatch(/^audit_\d+_\d+$/);
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.sessionId).toBe("s1");
    expect(entry.toolName).toBe("exec");
    expect(entry.action).toBe("execute");
    expect(entry.result).toBe("success");
    expect(entry.durationMs).toBe(100);
  });

  it("should record entry with metadata", () => {
    const entry = auditLog.record({
      sessionId: "s1",
      toolName: "exec",
      action: "execute",
      args: {},
      result: "failure",
      durationMs: 50,
      metadata: { error: "command not found" },
    });

    expect(entry.metadata).toEqual({ error: "command not found" });
  });

  it("should query entries by sessionId", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    auditLog.record({ sessionId: "s2", toolName: "read", action: "execute", args: {}, result: "success", durationMs: 5 });
    auditLog.record({ sessionId: "s1", toolName: "write", action: "execute", args: {}, result: "failure", durationMs: 20 });

    const results = auditLog.query({ sessionId: "s1" });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.sessionId === "s1")).toBe(true);
  });

  it("should query entries by toolName", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    auditLog.record({ sessionId: "s2", toolName: "read", action: "execute", args: {}, result: "success", durationMs: 5 });

    const results = auditLog.query({ toolName: "exec" });
    expect(results).toHaveLength(1);
    expect(results[0]!.toolName).toBe("exec");
  });

  it("should query entries by result", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    auditLog.record({ sessionId: "s2", toolName: "exec", action: "execute", args: {}, result: "failure", durationMs: 5 });

    const results = auditLog.query({ result: "failure" });
    expect(results).toHaveLength(1);
    expect(results[0]!.result).toBe("failure");
  });

  it("should query entries by time range", () => {
    const now = Date.now();
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });

    const results = auditLog.query({ startTime: now - 1000, endTime: now + 1000 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should support pagination", () => {
    for (let i = 0; i < 5; i++) {
      auditLog.record({ sessionId: `s${i}`, toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    }

    const page1 = auditLog.query({ limit: 2, offset: 0 });
    const page2 = auditLog.query({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
  });

  it("should return entries sorted by timestamp descending", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    auditLog.record({ sessionId: "s2", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });

    const results = auditLog.query({});
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.timestamp).toBeGreaterThanOrEqual(results[i]!.timestamp);
    }
  });

  it("should get stats", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    auditLog.record({ sessionId: "s2", toolName: "exec", action: "execute", args: {}, result: "failure", durationMs: 5 });
    auditLog.record({ sessionId: "s3", toolName: "read", action: "execute", args: {}, result: "success", durationMs: 3 });

    const stats = auditLog.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byResult.success).toBe(2);
    expect(stats.byResult.failure).toBe(1);
    expect(stats.byTool.exec).toBe(2);
    expect(stats.byTool.read).toBe(1);
  });

  it("should clear all entries", () => {
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    expect(auditLog.size()).toBe(1);
    auditLog.clear();
    expect(auditLog.size()).toBe(0);
  });

  it("should respect maxEntries limit", () => {
    const limitedLog = new AuditLog({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      limitedLog.record({ sessionId: `s${i}`, toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    }
    expect(limitedLog.size()).toBe(3);
  });

  it("should return correct size", () => {
    expect(auditLog.size()).toBe(0);
    auditLog.record({ sessionId: "s1", toolName: "exec", action: "execute", args: {}, result: "success", durationMs: 10 });
    expect(auditLog.size()).toBe(1);
  });
});

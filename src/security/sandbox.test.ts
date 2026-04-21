import { describe, it, expect, beforeEach } from "vitest";
import { VMSandbox } from "./sandbox.js";

describe("VMSandbox", () => {
  let sandbox: VMSandbox;

  beforeEach(() => {
    sandbox = new VMSandbox({ timeout: 5000 });
  });

  it("should execute simple code", async () => {
    const result = await sandbox.execute("1 + 1");
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it("should execute code with return value", async () => {
    const result = await sandbox.execute("const x = 42; x;");
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("should capture console output", async () => {
    const result = await sandbox.execute('console.log("hello"); console.warn("warning");');
    expect(result.success).toBe(true);
    expect(result.consoleOutput).toHaveLength(2);
    expect(result.consoleOutput[0]).toContain("hello");
    expect(result.consoleOutput[1]).toContain("warning");
  });

  it("should provide standard globals", async () => {
    const result = await sandbox.execute("JSON.stringify({a:1})");
    expect(result.success).toBe(true);
    expect(result.result).toBe('{"a":1}');
  });

  it("should accept custom context", async () => {
    const result = await sandbox.execute("data.name", { data: { name: "test" } });
    expect(result.success).toBe(true);
    expect(result.result).toBe("test");
  });

  it("should return error for invalid code", async () => {
    const result = await sandbox.execute("throw new Error('test error')");
    expect(result.success).toBe(false);
    expect(result.error).toContain("test error");
  });

  it("should return error for syntax errors", async () => {
    const result = await sandbox.execute("const x = ;");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should track execution time", async () => {
    const result = await sandbox.execute("1 + 1");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should validate safe code", () => {
    const validation = sandbox.validateCode("const x = 1 + 1;");
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("should detect syntax errors in validation", () => {
    const validation = sandbox.validateCode("const x = ;");
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("should detect process.exit in validation", () => {
    const validation = sandbox.validateCode("process.exit(1)");
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("process.exit"))).toBe(true);
  });

  it("should detect fs require when not allowed", () => {
    const validation = sandbox.validateCode('require("fs")');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("fs"))).toBe(true);
  });

  it("should detect net require when not allowed", () => {
    const validation = sandbox.validateCode('require("net")');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("net"))).toBe(true);
  });

  it("should allow fs require when allowed", () => {
    const fsSandbox = new VMSandbox({ allowFileSystem: true });
    const validation = fsSandbox.validateCode('require("fs")');
    expect(validation.valid).toBe(true);
  });

  it("should execute async code", async () => {
    const result = await sandbox.executeAsync("const x = await Promise.resolve(42); return x;");
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("should handle async errors", async () => {
    const result = await sandbox.executeAsync("throw new Error('async error')");
    expect(result.success).toBe(false);
    expect(result.error).toContain("async error");
  });

  it("should respect console output limit", async () => {
    const limitedSandbox = new VMSandbox({ maxConsoleOutput: 50 });
    const result = await limitedSandbox.execute('for(let i=0;i<100;i++)console.log("item"+i);');
    expect(result.success).toBe(true);
    const totalLength = result.consoleOutput.join("").length;
    expect(totalLength).toBeLessThanOrEqual(200);
  });
});

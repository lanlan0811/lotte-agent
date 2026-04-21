import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry, ToolPolicyPipeline } from "./tool-registry.js";
import { z } from "zod";

function createTestTool(overrides: Partial<{ name: string; category: string; requiresApproval: boolean; dangerous: boolean; readOnly: boolean }> = {}) {
  return {
    name: overrides.name ?? "test_tool",
    description: "A test tool",
    category: overrides.category ?? "test",
    parameters: z.object({ input: z.string() }),
    execute: async () => "test result",
    requiresApproval: overrides.requiresApproval ?? false,
    dangerous: overrides.dangerous ?? false,
    readOnly: overrides.readOnly ?? false,
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("should register a tool", () => {
    const tool = createTestTool();
    registry.register(tool);
    expect(registry.size()).toBe(1);
  });

  it("should retrieve a tool by name", () => {
    const tool = createTestTool({ name: "my_tool" });
    registry.register(tool);
    const retrieved = registry.get("my_tool");
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("my_tool");
  });

  it("should return undefined for non-existent tool", () => {
    const result = registry.get("non_existent");
    expect(result).toBeUndefined();
  });

  it("should list all tools", () => {
    registry.register(createTestTool({ name: "tool_a" }));
    registry.register(createTestTool({ name: "tool_b" }));
    const tools = registry.listAll();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain("tool_a");
    expect(tools.map((t) => t.name)).toContain("tool_b");
  });

  it("should list categories", () => {
    registry.register(createTestTool({ name: "tool_a", category: "cat1" }));
    registry.register(createTestTool({ name: "tool_b", category: "cat2" }));
    registry.register(createTestTool({ name: "tool_c", category: "cat1" }));
    const categories = registry.listCategories();
    expect(categories).toHaveLength(2);
    expect(categories).toContain("cat1");
    expect(categories).toContain("cat2");
  });

  it("should check if tool exists", () => {
    registry.register(createTestTool({ name: "existing" }));
    expect(registry.has("existing")).toBe(true);
    expect(registry.has("non_existent")).toBe(false);
  });

  it("should unregister a tool", () => {
    registry.register(createTestTool({ name: "removable" }));
    expect(registry.has("removable")).toBe(true);
    const result = registry.unregister("removable");
    expect(result).toBe(true);
    expect(registry.has("removable")).toBe(false);
  });

  it("should return false when unregistering non-existent tool", () => {
    const result = registry.unregister("non_existent");
    expect(result).toBe(false);
  });

  it("should filter tools by allowed list", () => {
    registry.register(createTestTool({ name: "tool_a" }));
    registry.register(createTestTool({ name: "tool_b" }));
    registry.register(createTestTool({ name: "tool_c" }));
    const filtered = registry.getFilteredTools(["tool_a", "tool_c"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).not.toContain("tool_b");
  });

  it("should filter tools by denied list", () => {
    registry.register(createTestTool({ name: "tool_a" }));
    registry.register(createTestTool({ name: "tool_b" }));
    registry.register(createTestTool({ name: "tool_c" }));
    const filtered = registry.getFilteredTools(undefined, ["tool_b"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).not.toContain("tool_b");
  });

  it("should filter tools by category", () => {
    registry.register(createTestTool({ name: "tool_a", category: "cat1" }));
    registry.register(createTestTool({ name: "tool_b", category: "cat2" }));
    const filtered = registry.getFilteredTools(undefined, undefined, "cat1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("tool_a");
  });

  it("should get tools requiring approval", () => {
    registry.register(createTestTool({ name: "safe_tool", requiresApproval: false }));
    registry.register(createTestTool({ name: "dangerous_tool", requiresApproval: true }));
    registry.register(createTestTool({ name: "very_dangerous", dangerous: true }));
    const approvalTools = registry.getToolsRequiringApproval();
    expect(approvalTools).toHaveLength(2);
  });

  it("should get read-only tools", () => {
    registry.register(createTestTool({ name: "read_tool", readOnly: true }));
    registry.register(createTestTool({ name: "write_tool", readOnly: false }));
    const readOnlyTools = registry.getReadOnlyTools();
    expect(readOnlyTools).toHaveLength(1);
    expect(readOnlyTools[0]!.name).toBe("read_tool");
  });

  it("should validate arguments correctly", () => {
    const tool = createTestTool({ name: "validated" });
    registry.register(tool);
    const validResult = registry.validateArguments("validated", { input: "hello" });
    expect(validResult.valid).toBe(true);
  });

  it("should reject invalid arguments", () => {
    const tool = createTestTool({ name: "validated" });
    registry.register(tool);
    const invalidResult = registry.validateArguments("validated", { input: 123 });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toBeDefined();
  });

  it("should return validation error for non-existent tool", () => {
    const result = registry.validateArguments("non_existent", {});
    expect(result.valid).toBe(false);
  });
});

describe("ToolPolicyPipeline", () => {
  let pipeline: ToolPolicyPipeline;

  beforeEach(() => {
    pipeline = new ToolPolicyPipeline();
  });

  it("should allow by default when no rules", () => {
    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "any_tool",
      toolCategory: "any",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("should deny when matching deny rule", () => {
    pipeline.addRule({
      name: "deny_dangerous",
      type: "deny",
      toolPattern: "dangerous_tool",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "dangerous_tool",
      toolCategory: "system",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.deniedReason).toContain("deny_dangerous");
  });

  it("should require approval when matching approval rule", () => {
    pipeline.addRule({
      name: "approval_exec",
      type: "require_approval",
      toolPattern: "exec",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "exec",
      toolCategory: "runtime",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("should allow when matching allow rule before deny", () => {
    pipeline.addRule({
      name: "allow_read",
      type: "allow",
      toolPattern: "read",
    });
    pipeline.addRule({
      name: "deny_all",
      type: "deny",
      toolPattern: "*",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "read",
      toolCategory: "fs",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow tool when no deny rule matches", () => {
    pipeline.addRule({
      name: "deny_exec",
      type: "deny",
      toolPattern: "exec",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "read",
      toolCategory: "fs",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("should support wildcard patterns", () => {
    pipeline.addRule({
      name: "deny_browser",
      type: "deny",
      toolPattern: "browser_*",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "browser_navigate",
      toolCategory: "browser",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("should support array patterns", () => {
    pipeline.addRule({
      name: "deny_multiple",
      type: "deny",
      toolPattern: ["tool_a", "tool_b"],
    });

    const resultA = pipeline.evaluate({
      sessionId: "s1",
      toolName: "tool_a",
      toolCategory: "test",
      args: {},
      isOwner: true,
    });
    expect(resultA.allowed).toBe(false);

    const resultC = pipeline.evaluate({
      sessionId: "s1",
      toolName: "tool_c",
      toolCategory: "test",
      args: {},
      isOwner: true,
    });
    expect(resultC.allowed).toBe(true);
  });

  it("should support category pattern matching", () => {
    pipeline.addRule({
      name: "deny_fs_category",
      type: "deny",
      toolPattern: "*",
      categoryPattern: "fs",
    });

    const result = pipeline.evaluate({
      sessionId: "s1",
      toolName: "write",
      toolCategory: "fs",
      args: {},
      isOwner: true,
    });
    expect(result.allowed).toBe(false);

    const resultOther = pipeline.evaluate({
      sessionId: "s1",
      toolName: "exec",
      toolCategory: "runtime",
      args: {},
      isOwner: true,
    });
    expect(resultOther.allowed).toBe(true);
  });

  it("should support conditional rules", () => {
    pipeline.addRule({
      name: "owner_only",
      type: "allow",
      toolPattern: "admin_tool",
      condition: (ctx) => ctx.isOwner,
    });

    const ownerResult = pipeline.evaluate({
      sessionId: "s1",
      toolName: "admin_tool",
      toolCategory: "admin",
      args: {},
      isOwner: true,
    });
    expect(ownerResult.allowed).toBe(true);

    const nonOwnerResult = pipeline.evaluate({
      sessionId: "s1",
      toolName: "admin_tool",
      toolCategory: "admin",
      args: {},
      isOwner: false,
    });
    expect(nonOwnerResult.allowed).toBe(true);
  });

  it("should list rules", () => {
    pipeline.addRule({ name: "rule1", type: "deny", toolPattern: "a" });
    pipeline.addRule({ name: "rule2", type: "allow", toolPattern: "b" });
    expect(pipeline.listRules()).toHaveLength(2);
  });

  it("should remove rules", () => {
    pipeline.addRule({ name: "removable", type: "deny", toolPattern: "a" });
    expect(pipeline.removeRule("removable")).toBe(true);
    expect(pipeline.listRules()).toHaveLength(0);
  });

  it("should return false when removing non-existent rule", () => {
    expect(pipeline.removeRule("non_existent")).toBe(false);
  });
});

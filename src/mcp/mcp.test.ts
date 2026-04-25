import { describe, it, expect, beforeEach } from "vitest";
import { MCPClientManager } from "./manager.js";
import type { MCPClientConfig, MCPConfig } from "../config/schema.js";

function createMockClientConfig(overrides: Partial<MCPClientConfig> = {}): MCPClientConfig {
  return {
    name: "test-mcp",
    description: "Test MCP client",
    enabled: true,
    transport: "stdio",
    command: "echo",
    args: [],
    headers: {},
    env: {},
    cwd: "",
    ...overrides,
  };
}

function createMockMCPConfig(clientOverrides: Record<string, Partial<MCPClientConfig>> = {}): MCPConfig {
  const clients: Record<string, MCPClientConfig> = {};
  for (const [key, overrides] of Object.entries(clientOverrides)) {
    clients[key] = createMockClientConfig({ name: key, ...overrides });
  }
  return { clients };
}

describe("MCPClientManager", () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    manager = new MCPClientManager();
  });

  it("should initialize with empty config", async () => {
    const config = createMockMCPConfig();
    await manager.initFromConfig(config);
    expect(manager.getAllEntries()).toHaveLength(0);
  });

  it("should skip disabled clients during init", async () => {
    const config = createMockMCPConfig({
      disabled_client: { enabled: false, transport: "stdio", command: "echo" },
    });
    await manager.initFromConfig(config);
    expect(manager.getAllEntries()).toHaveLength(0);
  });

  it("should track client entries even when connection fails", async () => {
    const config = createMockMCPConfig({
      failing_client: { transport: "stdio", command: "nonexistent-command-xyz" },
    });
    await manager.initFromConfig(config);
    const entries = manager.getAllEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const entry = entries.find((e) => e.key === "failing_client");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("error");
  }, 15000);

  it("should remove a client", async () => {
    const config = createMockMCPConfig({
      test_client: { transport: "stdio", command: "nonexistent-command-xyz" },
    });
    await manager.initFromConfig(config);
    await manager.removeClient("test_client");
    expect(manager.getEntry("test_client")).toBeUndefined();
  }, 15000);

  it("should close all clients", async () => {
    const config = createMockMCPConfig({
      client1: { transport: "stdio", command: "nonexistent-command-xyz" },
    });
    await manager.initFromConfig(config);
    await manager.closeAll();
    expect(manager.getAllEntries()).toHaveLength(0);
  }, 15000);

  it("should return client entry by key", async () => {
    const config = createMockMCPConfig({
      test_client: { transport: "stdio", command: "nonexistent-command-xyz" },
    });
    await manager.initFromConfig(config);
    const entry = manager.getEntry("test_client");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("test_client");
  }, 15000);

  it("should return undefined entry for non-existent key", () => {
    expect(manager.getEntry("non_existent")).toBeUndefined();
  });

  it("should return undefined client for non-existent key", () => {
    expect(manager.getClient("non_existent")).toBeUndefined();
  });

  it("should handle removeClient for non-existent key gracefully", async () => {
    await expect(manager.removeClient("non_existent")).resolves.toBeUndefined();
  });

  it("should throw when reconnecting non-existent client", async () => {
    await expect(manager.reconnectClient("non_existent")).rejects.toThrow("not found");
  });

  it("should return status for all clients", async () => {
    const config = createMockMCPConfig({
      test_client: { transport: "stdio", command: "nonexistent-command-xyz" },
    });
    await manager.initFromConfig(config);
    const status = manager.getStatus();
    expect(status.test_client).toBeDefined();
    expect(status.test_client!.status).toBe("error");
  }, 15000);

  it("should return empty tools array when no clients connected", () => {
    const tools = manager.getAllTools();
    expect(tools).toEqual([]);
  });

  it("should return empty tools for non-existent client key", () => {
    const tools = manager.getToolsByClient("non_existent");
    expect(tools).toEqual([]);
  });

  it("should throw when calling tool on non-existent client", async () => {
    await expect(manager.callTool("non_existent", "some_tool", {})).rejects.toThrow("not connected");
  });

  it("should return empty connected clients when none connected", () => {
    const connected = manager.getConnectedClients();
    expect(connected).toEqual([]);
  });

  it("should add a client manually", async () => {
    const config = createMockClientConfig({
      name: "manual_client",
      transport: "stdio",
      command: "nonexistent-command-xyz",
    });
    try {
      await manager.addClient("manual_client", config);
    } catch {
      // Connection will fail, that's expected
    }
    const entry = manager.getEntry("manual_client");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("manual_client");
  }, 15000);
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { WebSocket } from "ws";
import { createServer, type Server } from "node:http";
import { WebSocketManager } from "./websocket.js";
import { EventEmitter } from "./events.js";
import type { GatewayDeps } from "./server.js";
import type { LotteApp } from "../app.js";
import type { GatewayConfig } from "../config/schema.js";

function createMockApp(): LotteApp {
  return {
    isRunning: () => true,
    createSession: () => ({
      id: "test-session-1",
      config: { model: "gpt-4o", maxTurns: 25 },
      isActive: () => true,
      state: { status: "active", createdAt: Date.now(), updatedAt: Date.now() },
    }),
    getSession: () => undefined,
    getToolRegistry: () => ({
      listAll: () => [],
      listCategories: () => [],
      get: () => null,
    }),
    getConfig: () => ({
      getMain: () => ({ app_name: "lotte", version: "1.0.0", log_level: "info", language: "zh-CN", modules: {} }),
      getAI: () => ({ default_provider: "openai", default_model: "gpt-4o", providers: {} }),
      getGateway: () => ({ host: "127.0.0.1", port: 10623, auth: { mode: "none", token: "", password: "" }, websocket: {} }),
      getChannels: () => ({}),
      getMCP: () => ({ clients: {} }),
      getSkills: () => ({}),
      getTools: () => ({}),
      getAutomation: () => ({}),
      getNotification: () => ({}),
      getRAG: () => ({}),
      getMultimodal: () => ({}),
    }),
    getDatabase: () => ({
      getDb: () => ({
        prepare: () => ({ all: () => [], get: () => null, run: () => ({ changes: 0 }) }),
      }),
    }),
  } as unknown as LotteApp;
}

function createMockDeps(
  authMode: "none" | "token" | "password" = "none",
  token = "test-token",
  password = "test-password",
): GatewayDeps {
  return {
    app: createMockApp(),
    config: {
      host: "127.0.0.1",
      port: 0,
      auth: { mode: authMode, token, password },
      websocket: { max_connections: 10, heartbeat_interval: 30000 },
    } as GatewayConfig,
  };
}

function computeHmacResponse(nonce: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(nonce).digest("hex");
}

interface RawFrame {
  type: string;
  id?: string;
  ok?: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
  event?: string;
  seq?: number;
}

function waitForMessage(ws: WebSocket, timeout = 5000): Promise<RawFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners("message");
      reject(new Error("Timeout waiting for WebSocket message"));
    }, timeout);

    ws.once("message", (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()) as RawFrame);
      } catch (e) {
        reject(e);
      }
    });
  });
}

describe("WebSocket Challenge-Response Integration", () => {
  let httpServer: Server;
  let wsManager: WebSocketManager;
  let port: number;
  let events: EventEmitter;

  async function setupServer(authMode: "none" | "token" | "password" = "none"): Promise<void> {
    const deps = createMockDeps(authMode);
    events = new EventEmitter();
    wsManager = new WebSocketManager(deps, events);

    httpServer = createServer();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const addr = httpServer.address();
    port = typeof addr === "object" && addr ? addr.port : 0;

    wsManager.attach(httpServer);
  }

  afterEach(async () => {
    wsManager?.close();
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  describe("Auth mode: none", () => {
    beforeEach(async () => {
      await setupServer("none");
    });

    it("should receive hello-ok immediately when auth is none", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const frame = await waitForMessage(ws);
      ws.close();

      expect(frame.type).toBe("res");
      expect(frame.ok).toBe(true);
      const payload = frame.payload as Record<string, unknown>;
      expect(payload.type).toBe("hello-ok");
      expect(payload.protocol).toBe(1);
      expect(payload.server).toBeDefined();
      expect((payload.server as Record<string, unknown>).connId).toBeDefined();
      expect(payload.features).toBeDefined();
      expect(payload.policy).toBeDefined();
    });

    it("should be able to send requests after hello-ok", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send(JSON.stringify({
        type: "req",
        id: "test-1",
        method: "sessions.list",
        params: {},
      }));

      const response = await waitForMessage(ws);
      ws.close();

      expect(response.type).toBe("res");
      expect(response.id).toBe("test-1");
      expect(response.ok).toBe(true);
    });
  });

  describe("Auth mode: token", () => {
    beforeEach(async () => {
      await setupServer("token");
    });

    it("should receive challenge frame when auth is token", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const frame = await waitForMessage(ws);
      ws.close();

      expect(frame.type).toBe("res");
      expect(frame.ok).toBe(true);
      const payload = frame.payload as Record<string, unknown>;
      expect(payload.type).toBe("challenge");
      expect(payload.protocol).toBe(1);
      expect(payload.nonce).toBeDefined();
      expect(typeof (payload.nonce as string)).toBe("string");
      expect((payload.nonce as string).length).toBeGreaterThan(0);
      expect(payload.methods).toContain("hmac-token");
      expect(payload.timeoutMs).toBeDefined();
    });

    it("should authenticate with correct HMAC challenge response", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const challengeFrame = await waitForMessage(ws);
      const challenge = (challengeFrame.payload as Record<string, unknown>) as {
        nonce: string;
        methods: string[];
      };

      const challengeResponse = computeHmacResponse(challenge.nonce, "test-token");

      ws.send(JSON.stringify({
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          auth: { challengeResponse, method: "hmac-token" },
          client: { id: "test-client", version: "1.0.0", platform: "test", mode: "default" },
        },
      }));

      const helloFrame = await waitForMessage(ws);
      ws.close();

      expect(helloFrame.type).toBe("res");
      expect(helloFrame.ok).toBe(true);
      const payload = helloFrame.payload as Record<string, unknown>;
      expect(payload.type).toBe("hello-ok");
      expect(payload.server).toBeDefined();
    });

    it("should reject incorrect HMAC challenge response", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send(JSON.stringify({
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          auth: { challengeResponse: "wrong-response", method: "hmac-token" },
          client: { id: "test-client", version: "1.0.0", platform: "test", mode: "default" },
        },
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe("res");
      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("AUTH_FAILED");
      ws.close();
    });

    it("should reject requests before authentication", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send(JSON.stringify({
        type: "req",
        id: "test-unauth",
        method: "sessions.list",
        params: {},
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe("res");
      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("AUTH_REQUIRED");
      ws.close();
    });
  });

  describe("Auth mode: password", () => {
    beforeEach(async () => {
      await setupServer("password");
    });

    it("should receive challenge frame with hmac-password method", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const frame = await waitForMessage(ws);
      ws.close();

      const payload = frame.payload as Record<string, unknown>;
      expect(payload.type).toBe("challenge");
      expect(payload.methods).toContain("hmac-password");
    });

    it("should authenticate with correct HMAC password response", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const challengeFrame = await waitForMessage(ws);
      const challenge = (challengeFrame.payload as Record<string, unknown>) as {
        nonce: string;
      };

      const challengeResponse = computeHmacResponse(challenge.nonce, "test-password");

      ws.send(JSON.stringify({
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          auth: { challengeResponse, method: "hmac-password" },
          client: { id: "test-client", version: "1.0.0", platform: "test", mode: "default" },
        },
      }));

      const helloFrame = await waitForMessage(ws);
      ws.close();

      expect(helloFrame.ok).toBe(true);
      const payload = helloFrame.payload as Record<string, unknown>;
      expect(payload.type).toBe("hello-ok");
    });

    it("should reject incorrect HMAC password response", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send(JSON.stringify({
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          auth: { challengeResponse: "wrong-password-response", method: "hmac-password" },
          client: { id: "test-client", version: "1.0.0", platform: "test", mode: "default" },
        },
      }));

      const response = await waitForMessage(ws);
      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("AUTH_FAILED");
    });
  });

  describe("WebSocket Manager Stats", () => {
    beforeEach(async () => {
      await setupServer("none");
    });

    it("should track connected client count", async () => {
      expect(wsManager.getConnectedCount()).toBe(0);

      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws1);
      expect(wsManager.getConnectedCount()).toBe(1);

      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws2);
      expect(wsManager.getConnectedCount()).toBe(2);

      ws1.close();
      ws2.close();

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(wsManager.getConnectedCount()).toBe(0);
    });

    it("should track authenticated client count", async () => {
      expect(wsManager.getAuthenticatedCount()).toBe(0);

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);
      expect(wsManager.getAuthenticatedCount()).toBe(1);

      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  });

  describe("Protocol validation", () => {
    beforeEach(async () => {
      await setupServer("none");
    });

    it("should return PARSE_ERROR for invalid JSON", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send("not valid json {{{");
      const response = await waitForMessage(ws);

      expect(response.type).toBe("res");
      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("PARSE_ERROR");
      ws.close();
    });

    it("should return METHOD_ERROR for unknown method", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await waitForMessage(ws);

      ws.send(JSON.stringify({
        type: "req",
        id: "test-unknown",
        method: "nonexistent.method",
        params: {},
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe("res");
      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("METHOD_ERROR");
      ws.close();
    });
  });
});

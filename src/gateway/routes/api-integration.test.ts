import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./health.js";
import { registerSessionRoutes } from "./session.js";
import { registerConfigRoutes } from "./config.js";
import { registerToolRoutes } from "./tools.js";
import { registerAuthMiddleware, authenticateRequest, type AuthConfig } from "../auth.js";
import type { GatewayDeps } from "../server.js";
import type { LotteApp } from "../../app.js";
import type { GatewayConfig } from "../../config/schema.js";

function createMockApp(partial: Partial<LotteApp> = {}): LotteApp {
  return {
    isRunning: partial.isRunning ?? (() => true),
    createSession: partial.createSession ?? (() => ({
      id: "test-session-1",
      config: { model: "gpt-4o", maxTurns: 25 },
      isActive: () => true,
      state: { status: "active", createdAt: Date.now(), updatedAt: Date.now() },
    })),
    getSession: partial.getSession ?? (() => undefined),
    getToolRegistry: partial.getToolRegistry ?? (() => ({
      listAll: () => [
        { name: "bash", description: "Execute shell commands", category: "system", requiresApproval: true, dangerous: true, readOnly: false, parameters: { shape: {} } },
        { name: "read", description: "Read file content", category: "file", requiresApproval: false, dangerous: false, readOnly: true, parameters: { shape: {} } },
      ],
      listCategories: () => ["system", "file"],
      get: () => null,
    })),
    getConfig: partial.getConfig ?? (() => ({
      getMain: () => ({ app_name: "lotte", version: "1.0.0", log_level: "info", language: "zh-CN", modules: {} }),
      getAI: () => ({ default_provider: "openai", default_model: "gpt-4o", providers: {} }),
      getGateway: () => ({ host: "127.0.0.1", port: 10623, auth: { mode: "none", token: "", password: "" }, websocket: {} }),
      getChannels: () => ({ weixin: { enabled: false }, qq: { enabled: false }, feishu: { enabled: false } }),
      getMCP: () => ({ clients: {} }),
      getSkills: () => ({}),
      getTools: () => ({}),
      getAutomation: () => ({}),
      getNotification: () => ({}),
      getRAG: () => ({}),
      getMultimodal: () => ({}),
    })),
    getDatabase: partial.getDatabase ?? (() => ({
      getDb: () => ({
        prepare: () => ({ all: () => [], get: () => null, run: () => ({ changes: 0 }) }),
      }),
    })),
  } as unknown as LotteApp;
}

function createMockDeps(app?: LotteApp, authMode: "none" | "token" | "password" = "none"): GatewayDeps {
  return {
    app: app ?? createMockApp(),
    config: {
      host: "127.0.0.1",
      port: 10623,
      auth: { mode: authMode, token: "test-token", password: "test-password" },
      websocket: { max_connections: 10, heartbeat_interval: 30000 },
    } as GatewayConfig,
  };
}

async function buildTestApp(deps: GatewayDeps): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  registerAuthMiddleware(fastify, deps.config);
  registerHealthRoutes(fastify, deps);
  registerSessionRoutes(fastify, deps, "/api/v1");
  registerConfigRoutes(fastify, deps, "/api/v1");
  registerToolRoutes(fastify, deps, "/api/v1");
  return fastify;
}

describe("Gateway API Integration Tests", () => {
  describe("Health Routes", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = await buildTestApp(createMockDeps());
    });

    it("GET /health should return server status", async () => {
      const response = await fastify.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("running");
      expect(body.data.version).toBeDefined();
      expect(body.data.uptime).toBeDefined();
      expect(body.data.timestamp).toBeDefined();
    });

    it("GET /api/v1/health should return API health status", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("running");
    });
  });

  describe("Session Routes", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = await buildTestApp(createMockDeps());
    });

    it("GET /api/v1/sessions should return sessions list", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/sessions" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.sessions).toBeDefined();
    });

    it("POST /api/v1/sessions should create a new session", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { model: "gpt-4o", maxTurns: 25 },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.status).toBe("active");
    });

    it("GET /api/v1/sessions/:id should return 404 for non-existent session", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/sessions/non-existent-id" });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("Config Routes", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = await buildTestApp(createMockDeps());
    });

    it("GET /api/v1/config/main should return main config", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/config/main" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.app_name).toBe("lotte");
    });

    it("GET /api/v1/config/ai should return AI config", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/config/ai" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.default_provider).toBe("openai");
    });

    it("GET /api/v1/config/gateway should return gateway config", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/config/gateway" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.host).toBe("127.0.0.1");
    });

    it("GET /api/v1/config/invalid should return 400", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/config/invalid_module" });
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_MODULE");
    });
  });

  describe("Tool Routes", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = await buildTestApp(createMockDeps());
    });

    it("GET /api/v1/tools should return tools catalog", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/tools" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.tools).toBeDefined();
      expect(body.data.categories).toBeDefined();
      expect(body.data.total).toBeGreaterThan(0);
    });

    it("GET /api/v1/tools/:name should return 404 for non-existent tool", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/tools/non_existent_tool" });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("TOOL_NOT_FOUND");
    });
  });

  describe("Authentication", () => {
    it("should allow access when auth mode is none", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "none"));
      const response = await fastify.inject({ method: "GET", url: "/api/v1/sessions" });
      expect(response.statusCode).toBe(200);
    });

    it("should reject access without token when auth mode is token", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "token"));
      const response = await fastify.inject({ method: "GET", url: "/api/v1/sessions" });
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("AUTH_FAILED");
    });

    it("should allow access with valid token when auth mode is token", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "token"));
      const response = await fastify.inject({
        method: "GET",
        url: "/api/v1/sessions",
        headers: { Authorization: "Bearer test-token" },
      });
      expect(response.statusCode).toBe(200);
    });

    it("should reject access with invalid token", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "token"));
      const response = await fastify.inject({
        method: "GET",
        url: "/api/v1/sessions",
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("should allow access to public paths without auth", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "token"));
      const response = await fastify.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    });

    it("should allow access with valid password when auth mode is password", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "password"));
      const credentials = Buffer.from("admin:test-password").toString("base64");
      const response = await fastify.inject({
        method: "GET",
        url: "/api/v1/sessions",
        headers: { Authorization: `Basic ${credentials}` },
      });
      expect(response.statusCode).toBe(200);
    });

    it("should reject access with invalid password", async () => {
      const fastify = await buildTestApp(createMockDeps(createMockApp(), "password"));
      const credentials = Buffer.from("admin:wrong-password").toString("base64");
      const response = await fastify.inject({
        method: "GET",
        url: "/api/v1/sessions",
        headers: { Authorization: `Basic ${credentials}` },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("authenticateRequest unit tests", () => {
    it("should authenticate with mode none", () => {
      const config: AuthConfig = { mode: "none", token: "", password: "" };
      const request = { headers: {} } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("none");
    });

    it("should reject missing token", () => {
      const config: AuthConfig = { mode: "token", token: "secret", password: "" };
      const request = { headers: {} } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("Missing");
    });

    it("should accept valid bearer token", () => {
      const config: AuthConfig = { mode: "token", token: "secret", password: "" };
      const request = { headers: { authorization: "Bearer secret" } } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("token");
    });

    it("should reject invalid bearer token", () => {
      const config: AuthConfig = { mode: "token", token: "secret", password: "" };
      const request = { headers: { authorization: "Bearer wrong" } } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("Invalid");
    });

    it("should accept valid basic auth password", () => {
      const config: AuthConfig = { mode: "password", token: "", password: "mypass" };
      const credentials = Buffer.from("admin:mypass").toString("base64");
      const request = { headers: { authorization: `Basic ${credentials}` } } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("password");
      expect(result.user).toBe("admin");
    });

    it("should reject invalid basic auth password", () => {
      const config: AuthConfig = { mode: "password", token: "", password: "mypass" };
      const credentials = Buffer.from("admin:wrongpass").toString("base64");
      const request = { headers: { authorization: `Basic ${credentials}` } } as any;
      const result = authenticateRequest(request, config);
      expect(result.authenticated).toBe(false);
    });
  });

  describe("Error Response Format", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = await buildTestApp(createMockDeps());
    });

    it("should return consistent error format for 404", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/sessions/non-existent" });
      const body = response.json();
      expect(body).toHaveProperty("ok", false);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    });

    it("should return consistent error format for 400", async () => {
      const response = await fastify.inject({ method: "GET", url: "/api/v1/config/invalid" });
      const body = response.json();
      expect(body).toHaveProperty("ok", false);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    });
  });
});

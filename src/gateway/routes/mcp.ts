import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import type { MCPClientConfig } from "../../config/schema.js";
import { formatErrorMessage } from "../../errors/errors.js";

function maskEnvValue(value: string): string {
  if (!value) return value;
  const length = value.length;
  if (length <= 8) return "*".repeat(length);
  const prefixLen = length > 2 && value[2] === "-" ? 3 : 2;
  const prefix = value.slice(0, prefixLen);
  const suffix = value.slice(-4);
  const maskedLen = Math.max(length - prefixLen - 4, 4);
  return `${prefix}${"*".repeat(maskedLen)}${suffix}`;
}

function buildClientResponse(key: string, config: MCPClientConfig, status?: string, error?: string) {
  return {
    key,
    name: config.name,
    description: config.description,
    enabled: config.enabled,
    transport: config.transport,
    url: config.url ?? "",
    headers: Object.fromEntries(
      Object.entries(config.headers).map(([k, v]) => [k, maskEnvValue(v)]),
    ),
    command: config.command ?? "",
    args: config.args,
    env: Object.fromEntries(
      Object.entries(config.env).map(([k, v]) => [k, maskEnvValue(v)]),
    ),
    cwd: config.cwd,
    status: status ?? "unknown",
    error,
  };
}

interface CreateMCPBody {
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  transport?: "stdio" | "streamable_http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
}

interface UpdateMCPBody {
  name?: string;
  description?: string;
  enabled?: boolean;
  transport?: "stdio" | "streamable_http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
}

export function registerMCPRoutes(fastify: FastifyInstance, deps: GatewayDeps, apiPrefix: string): void {
  fastify.get(`${apiPrefix}/mcp`, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const app = deps.app;
    const mcpManager = app.getMCPManager();
    if (!mcpManager) {
      return { ok: true, data: [] };
    }

    const config = app.getConfig().getMCP();
    const entries = mcpManager.getAllEntries();
    const result = entries.map((entry) => {
      const clientConfig = config.clients[entry.key] || entry.client.getConfig();
      return buildClientResponse(entry.key, clientConfig, entry.status, entry.error);
    });

    return { ok: true, data: result };
  });

  fastify.get(`${apiPrefix}/mcp/status`, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const app = deps.app;
    const mcpManager = app.getMCPManager();
    if (!mcpManager) {
      return { ok: true, data: {} };
    }

    return { ok: true, data: mcpManager.getStatus() };
  });

  fastify.get(`${apiPrefix}/mcp/:key`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };
    const app = deps.app;
    const mcpManager = app.getMCPManager();
    if (!mcpManager) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    const entry = mcpManager.getEntry(key);
    if (!entry) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    const config = app.getConfig().getMCP();
    const clientConfig = config.clients[key] || entry.client.getConfig();
    return { ok: true, data: buildClientResponse(key, clientConfig, entry.status, entry.error) };
  });

  fastify.get(`${apiPrefix}/mcp/:key/tools`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };
    const app = deps.app;
    const mcpManager = app.getMCPManager();
    if (!mcpManager) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    const entry = mcpManager.getEntry(key);
    if (!entry) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    return { ok: true, data: entry.client.getToolsSnapshot() };
  });

  fastify.post(`${apiPrefix}/mcp`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateMCPBody;
    const { key, ...clientData } = body;

    if (!key || !clientData.name) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "key and name are required" } };
    }

    const app = deps.app;
    const config = app.getConfig();
    const mcpConfig = config.getMCP();

    if (mcpConfig.clients[key]) {
      reply.status(400);
      return { ok: false, error: { code: "CONFLICT", message: `MCP client '${key}' already exists. Use PUT to update.` } };
    }

    const newClient: MCPClientConfig = {
      name: clientData.name,
      description: clientData.description ?? "",
      enabled: clientData.enabled ?? true,
      transport: clientData.transport ?? "stdio",
      command: clientData.command,
      args: clientData.args ?? [],
      url: clientData.url,
      headers: clientData.headers ?? {},
      env: clientData.env ?? {},
      cwd: clientData.cwd ?? "",
    };

    if (newClient.transport === "stdio" && !newClient.command) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "stdio transport requires a command" } };
    }

    if ((newClient.transport === "streamable_http" || newClient.transport === "sse") && !newClient.url) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `${newClient.transport} transport requires a url` } };
    }

    mcpConfig.clients[key] = newClient;
    await config.saveModule("mcp", { clients: mcpConfig.clients });

    const mcpManager = app.getMCPManager();
    if (mcpManager && newClient.enabled) {
      try {
        await mcpManager.addClient(key, newClient);
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.warn(`Failed to connect new MCP client '${key}': ${msg}`);
      }
    }

    reply.status(201);
    return { ok: true, data: buildClientResponse(key, newClient) };
  });

  fastify.put(`${apiPrefix}/mcp/:key`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };
    const body = request.body as UpdateMCPBody;

    const app = deps.app;
    const config = app.getConfig();
    const mcpConfig = config.getMCP();

    if (!mcpConfig.clients[key]) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    const existing = mcpConfig.clients[key];
    const updated: MCPClientConfig = {
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      enabled: body.enabled ?? existing.enabled,
      transport: body.transport ?? existing.transport,
      command: body.command ?? existing.command,
      args: body.args ?? existing.args,
      url: body.url ?? existing.url,
      headers: body.headers ?? existing.headers,
      env: body.env ?? existing.env,
      cwd: body.cwd ?? existing.cwd,
    };

    mcpConfig.clients[key] = updated;
    await config.saveModule("mcp", { clients: mcpConfig.clients });

    const mcpManager = app.getMCPManager();
    if (mcpManager && updated.enabled) {
      try {
        await mcpManager.replaceClient(key, updated);
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.warn(`Failed to replace MCP client '${key}': ${msg}`);
      }
    } else if (mcpManager && !updated.enabled) {
      await mcpManager.removeClient(key);
    }

    return { ok: true, data: buildClientResponse(key, updated) };
  });

  fastify.patch(`${apiPrefix}/mcp/:key/toggle`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };

    const app = deps.app;
    const config = app.getConfig();
    const mcpConfig = config.getMCP();

    if (!mcpConfig.clients[key]) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    const client = mcpConfig.clients[key];
    client.enabled = !client.enabled;
    await config.saveModule("mcp", { clients: mcpConfig.clients });

    const mcpManager = app.getMCPManager();
    if (mcpManager) {
      if (client.enabled) {
        try {
          await mcpManager.addClient(key, client);
        } catch (error) {
          const msg = formatErrorMessage(error);
          logger.warn(`Failed to connect MCP client '${key}': ${msg}`);
        }
      } else {
        await mcpManager.removeClient(key);
      }
    }

    return { ok: true, data: buildClientResponse(key, client) };
  });

  fastify.delete(`${apiPrefix}/mcp/:key`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = request.params as { key: string };

    const app = deps.app;
    const config = app.getConfig();
    const mcpConfig = config.getMCP();

    if (!mcpConfig.clients[key]) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `MCP client '${key}' not found` } };
    }

    delete mcpConfig.clients[key];
    await config.saveModule("mcp", { clients: mcpConfig.clients });

    const mcpManager = app.getMCPManager();
    if (mcpManager) {
      await mcpManager.removeClient(key);
    }

    return { ok: true, data: { message: `MCP client '${key}' deleted successfully` } };
  });
}

import { logger } from "../../utils/logger.js";

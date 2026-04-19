import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import { SkillConflictError, suggestConflictName } from "../../skills/hub.js";
import { SkillScanner } from "../../skills/scanner.js";
import { getBuiltinSkillDefinitions } from "../../skills/builtins.js";

export
interface CreateSkillBody {
  name: string;
  version?: string;
  description?: string;
  content: string;
  tags?: string[];
  source?: "local" | "hub" | "builtin";
  sourceUrl?: string;
  references?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
}

interface UpdateSkillBody {
  description?: string;
  content?: string;
  enabled?: boolean;
  tags?: string[];
  references?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
}

interface SearchHubBody {
  query: string;
  limit?: number;
  offset?: number;
}

interface InstallFromHubBody {
  slug: string;
  version?: string;
}

export function registerSkillRoutes(fastify: FastifyInstance, deps: GatewayDeps, apiPrefix: string): void {
  fastify.get(`${apiPrefix}/skills`, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      return { ok: true, data: [] };
    }

    const skills = skillManager.listSkills();
    return { ok: true, data: skills };
  });

  fastify.get(`${apiPrefix}/skills/:name`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: "Skill manager not available" } };
    }

    const skill = skillManager.getSkill(name);
    if (!skill) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Skill '${name}' not found` } };
    }

    return { ok: true, data: skill };
  });

  fastify.post(`${apiPrefix}/skills`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateSkillBody;
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    if (!body.name || !body.content) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "name and content are required" } };
    }

    const existing = skillManager.getSkill(body.name);
    if (existing) {
      reply.status(409);
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: `Skill '${body.name}' already exists`,
          suggested_name: suggestConflictName(body.name),
        },
      };
    }

    const skill = skillManager.addSkill({
      name: body.name,
      version: body.version ?? "0.1.0",
      description: body.description ?? "",
      enabled: true,
      source: body.source ?? "local",
      sourceUrl: body.sourceUrl,
      content: body.content,
      references: body.references ?? {},
      scripts: body.scripts ?? {},
      tags: body.tags ?? [],
    });

    reply.status(201);
    return { ok: true, data: skill };
  });

  fastify.put(`${apiPrefix}/skills/:name`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const body = request.body as UpdateSkillBody;
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    const existing = skillManager.getSkill(name);
    if (!existing) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Skill '${name}' not found` } };
    }

    const updated = skillManager.updateSkill(name, {
      description: body.description,
      content: body.content,
      enabled: body.enabled,
      tags: body.tags,
      references: body.references,
      scripts: body.scripts,
    });

    return { ok: true, data: updated };
  });

  fastify.patch(`${apiPrefix}/skills/:name/toggle`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    const skill = skillManager.toggleSkill(name);
    if (!skill) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Skill '${name}' not found` } };
    }

    return { ok: true, data: skill };
  });

  fastify.delete(`${apiPrefix}/skills/:name`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    const removed = skillManager.removeSkill(name);
    if (!removed) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Skill '${name}' not found` } };
    }

    return { ok: true, data: { message: `Skill '${name}' deleted successfully` } };
  });

  fastify.get(`${apiPrefix}/skills/builtin/list`, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const definitions = getBuiltinSkillDefinitions();
    return { ok: true, data: definitions };
  });

  fastify.post(`${apiPrefix}/skills/builtin/install`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.body as { name: string };
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    const definition = getBuiltinSkillDefinitions().find((d) => d.name === name);
    if (!definition) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Built-in skill '${name}' not found` } };
    }

    const existing = skillManager.getSkill(name);
    if (existing) {
      reply.status(409);
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: `Skill '${name}' already exists`,
          suggested_name: suggestConflictName(name),
        },
      };
    }

    const skill = skillManager.addSkill({
      name: definition.name,
      version: definition.version,
      description: definition.description,
      enabled: true,
      source: "builtin",
      content: definition.content,
      references: {},
      scripts: {},
      tags: definition.tags,
    });

    return { ok: true, data: skill };
  });

  fastify.post(`${apiPrefix}/skills/hub/search`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, limit, offset } = request.body as SearchHubBody;

    if (!query) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "query is required" } };
    }

    const { SkillHubClient } = await import("../../skills/hub.js");
    const hubClient = new SkillHubClient();

    try {
      const results = await hubClient.search(query, { limit, offset });
      return { ok: true, data: results };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(502);
      return { ok: false, error: { code: "HUB_ERROR", message: `Hub search failed: ${msg}` } };
    }
  });

  fastify.post(`${apiPrefix}/skills/hub/install`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug, version } = request.body as InstallFromHubBody;
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    if (!slug) {
      reply.status(400);
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "slug is required" } };
    }

    const { SkillHubClient } = await import("../../skills/hub.js");
    const hubClient = new SkillHubClient();

    try {
      const result = await hubClient.installFromHub(slug, skillManager, { version });
      return { ok: true, data: result };
    } catch (error) {
      if (error instanceof SkillConflictError) {
        reply.status(409);
        return {
          ok: false,
          error: {
            code: "CONFLICT",
            message: error.message,
            suggested_name: suggestConflictName(error.skillName),
          },
        };
      }

      const msg = error instanceof Error ? error.message : String(error);
      reply.status(502);
      return { ok: false, error: { code: "HUB_ERROR", message: `Hub install failed: ${msg}` } };
    }
  });

  fastify.post(`${apiPrefix}/skills/:name/scan`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const skillManager = deps.app.getSkillManager();
    if (!skillManager) {
      reply.status(503);
      return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Skill manager not available" } };
    }

    const skill = skillManager.getSkill(name);
    if (!skill) {
      reply.status(404);
      return { ok: false, error: { code: "NOT_FOUND", message: `Skill '${name}' not found` } };
    }

    const scanner = new SkillScanner();
    const skillDir = `${skillManager.getPoolDir()}/${name}`;
    const result = scanner.scanSkill(skillDir, name);

    return { ok: true, data: result };
  });
}

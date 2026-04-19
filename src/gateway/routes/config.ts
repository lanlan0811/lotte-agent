import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

const VALID_MODULES = [
  "main",
  "ai",
  "gateway",
  "channels",
  "mcp",
  "skills",
  "tools",
  "automation",
  "notification",
  "rag",
  "multimodal",
];

export function registerConfigRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/config/:module`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { module } = request.params as { module: string };

    if (!VALID_MODULES.includes(module)) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "INVALID_MODULE",
          message: `Invalid config module: ${module}`,
          details: { validModules: VALID_MODULES },
        },
      });
      return;
    }

    try {
      const config = deps.app.getConfig();
      let data: unknown;

      switch (module) {
        case "main":
          data = config.getMain();
          break;
        case "ai":
          data = config.getAI();
          break;
        case "gateway":
          data = config.getGateway();
          break;
        case "channels":
          data = config.getChannels();
          break;
        case "mcp":
          data = config.getMCP();
          break;
        case "skills":
          data = config.getSkills();
          break;
        case "tools":
          data = config.getTools();
          break;
        case "automation":
          data = config.getAutomation();
          break;
        case "notification":
          data = config.getNotification();
          break;
        case "rag":
          data = config.getRAG();
          break;
        case "multimodal":
          data = config.getMultimodal();
          break;
        default:
          data = null;
      }

      reply.send({ ok: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CONFIG_GET_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.put(`${prefix}/config/:module`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { module } = request.params as { module: string };

    if (!VALID_MODULES.includes(module)) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "INVALID_MODULE",
          message: `Invalid config module: ${module}`,
          details: { validModules: VALID_MODULES },
        },
      });
      return;
    }

    try {
      const config = deps.app.getConfig();
      config.saveModule(module, (request.body as Record<string, unknown>) ?? {});

      reply.send({ ok: true, data: { module, updated: true } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CONFIG_UPDATE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(`${prefix}/config/schema`, async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      ok: true,
      data: {
        modules: VALID_MODULES,
        version: "1.0.0",
      },
    });
  });
}

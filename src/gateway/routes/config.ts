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

  fastify.post(`${prefix}/config/probe-multimodal`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { modelId?: string; timeout?: number };

    if (!body.modelId) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "modelId is required",
          details: null,
        },
      });
      return;
    }

    try {
      const modelManager = deps.app.getModelManager();
      const result = await modelManager.probeModelMultimodal(body.modelId, body.timeout);

      reply.send({
        ok: true,
        data: {
          modelId: body.modelId,
          supportsImage: result.supportsImage,
          supportsVideo: result.supportsVideo,
          supportsMultimodal: result.supportsImage || result.supportsVideo,
          imageMessage: result.imageMessage,
          videoMessage: result.videoMessage,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "PROBE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(`${prefix}/config/multimodal-cache`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const modelManager = deps.app.getModelManager();
      const prober = modelManager.getMultimodalProber();
      const models = modelManager.listAllModels();
      const cache: Record<string, unknown> = {};

      for (const model of models) {
        const qualifiedId = `${model.provider}/${model.id}`;
        const cached = prober.getCached(qualifiedId);
        if (cached) {
          cache[qualifiedId] = {
            supportsImage: cached.supportsImage,
            supportsVideo: cached.supportsVideo,
            supportsMultimodal: cached.supportsImage || cached.supportsVideo,
          };
        }
      }

      reply.send({ ok: true, data: cache });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CACHE_ERROR", message: msg, details: null },
      });
    }
  });
}

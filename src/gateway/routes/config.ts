import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import { formatErrorMessage } from "../../errors/errors.js";

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
  fastify.get(`${prefix}/config`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = deps.app.getConfig();
      const data: Record<string, unknown> = {
        main: config.getMain(),
        ai: config.getAI(),
        gateway: config.getGateway(),
        channels: config.getChannels(),
        mcp: config.getMCP(),
        skills: config.getSkills(),
        tools: config.getTools(),
        automation: config.getAutomation(),
        notification: config.getNotification(),
        rag: config.getRAG(),
        multimodal: config.getMultimodal(),
      };
      reply.send({ ok: true, data });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CONFIG_GET_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.put(`${prefix}/config`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (request.body as Record<string, unknown>) ?? {};
      const config = deps.app.getConfig();

      const moduleMap: Record<string, string> = {
        main: "main",
        ai: "ai",
        gateway: "gateway",
        channels: "channels",
        mcp: "mcp",
        skills: "skills",
        tools: "tools",
        automation: "automation",
        notification: "notification",
        rag: "rag",
        multimodal: "multimodal",
      };

      const updated: string[] = [];

      for (const [key, moduleName] of Object.entries(moduleMap)) {
        if (body[key] !== undefined) {
          await config.saveModule(moduleName, body[key] as Record<string, unknown>);
          updated.push(moduleName);
        }
      }

      reply.send({ ok: true, data: { updated } });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CONFIG_UPDATE_ERROR", message: msg, details: null },
      });
    }
  });

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
      const msg = formatErrorMessage(error);
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
      const msg = formatErrorMessage(error);
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
      const msg = formatErrorMessage(error);
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
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "CACHE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.post(`${prefix}/config/test-connection`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { url?: string; apiKey?: string; model?: string };

    if (!body.url) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "url is required",
          details: null,
        },
      });
      return;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (body.apiKey) {
        headers["Authorization"] = `Bearer ${body.apiKey}`;
      }

      const testBody = {
        model: body.model || "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        stream: false,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${body.url.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(testBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 200) {
        reply.send({ ok: true, data: { connected: true, statusCode: response.status } });
      } else {
        const errorText = await response.text().catch(() => "");
        reply.send({
          ok: false,
          error: {
            code: "CONNECTION_FAILED",
            message: `Server returned ${response.status}: ${errorText.slice(0, 200)}`,
            details: { statusCode: response.status },
          },
        });
      }
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.send({
        ok: false,
        error: {
          code: "CONNECTION_ERROR",
          message: msg,
          details: null,
        },
      });
    }
  });
}

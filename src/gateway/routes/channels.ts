import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export async function registerChannelRoutes(fastify: FastifyInstance, deps: GatewayDeps): Promise<void> {
  const { app } = deps;

  fastify.get("/api/v1/channels", async (_request: FastifyRequest, reply: FastifyReply) => {
    const channelManager = app.getChannelManager();
    if (!channelManager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Channel system not initialized" },
      });
    }

    const infos = channelManager.getChannelInfos();
    return reply.send({ ok: true, data: infos });
  });

  fastify.get("/api/v1/channels/:type", async (request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
    const channelManager = app.getChannelManager();
    if (!channelManager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Channel system not initialized" },
      });
    }

    const channel = channelManager.getChannel(request.params.type);
    if (!channel) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: `Channel '${request.params.type}' not found` },
      });
    }

    return reply.send({ ok: true, data: channel.getInfo() });
  });

  fastify.post("/api/v1/channels/:type/start", async (request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
    const channelManager = app.getChannelManager();
    if (!channelManager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Channel system not initialized" },
      });
    }

    const channel = channelManager.getChannel(request.params.type);
    if (!channel) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: `Channel '${request.params.type}' not found` },
      });
    }

    if (channel.status === "running") {
      return reply.send({ ok: true, data: { type: request.params.type, status: "running", message: "Already running" } });
    }

    try {
      await channel.start();
      return reply.send({ ok: true, data: { type: request.params.type, status: channel.status } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "START_FAILED", message: msg } });
    }
  });

  fastify.post("/api/v1/channels/:type/stop", async (request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
    const channelManager = app.getChannelManager();
    if (!channelManager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Channel system not initialized" },
      });
    }

    const channel = channelManager.getChannel(request.params.type);
    if (!channel) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: `Channel '${request.params.type}' not found` },
      });
    }

    try {
      await channel.stop();
      return reply.send({ ok: true, data: { type: request.params.type, status: channel.status } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "STOP_FAILED", message: msg } });
    }
  });

  fastify.post(
    "/api/v1/channels/send",
    async (
      request: FastifyRequest<{
        Body: { channel_type: string; to_handle: string; text: string; meta?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const channelManager = app.getChannelManager();
      if (!channelManager) {
        return reply.code(503).send({
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Channel system not initialized" },
        });
      }

      const { channel_type, to_handle, text, meta } = request.body ?? {};

      if (!channel_type || !to_handle || !text) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Missing required fields: channel_type, to_handle, text" },
        });
      }

      try {
        await channelManager.sendCrossChannel(channel_type, to_handle, text, meta);
        return reply.send({ ok: true, data: { sent: true } });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ ok: false, error: { code: "SEND_FAILED", message: msg } });
      }
    },
  );
}

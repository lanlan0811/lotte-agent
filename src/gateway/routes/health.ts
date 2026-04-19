import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export function registerHealthRoutes(fastify: FastifyInstance, deps: GatewayDeps): void {
  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const app = deps.app;

    reply.send({
      ok: true,
      data: {
        status: app.isRunning() ? "running" : "stopped",
        version: "0.1.0",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now(),
      },
    });
  });

  fastify.get("/api/v1/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const app = deps.app;

    reply.send({
      ok: true,
      data: {
        status: app.isRunning() ? "running" : "stopped",
        version: "0.1.0",
        uptime: process.uptime(),
        timestamp: Date.now(),
      },
    });
  });
}

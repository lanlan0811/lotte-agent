import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export async function registerAutomationRoutes(fastify: FastifyInstance, deps: GatewayDeps): Promise<void> {
  const { app } = deps;

  fastify.get("/api/v1/cron/jobs", async (_request: FastifyRequest, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const jobs = manager.listCronJobs();
    return reply.send({ ok: true, data: jobs });
  });

  fastify.post(
    "/api/v1/cron/jobs",
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          schedule: { kind: string; expr?: string; everyMs?: number; at?: number; tz?: string };
          prompt: string;
          channelId?: string;
          sessionId?: string;
          enabled?: boolean;
          deleteAfterRun?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const manager = app.getAutomationManager();
      if (!manager) {
        return reply.code(503).send({
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
        });
      }

      const body = request.body ?? {};
      if (!body.name || !body.schedule || !body.prompt) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Missing required fields: name, schedule, prompt" },
        });
      }

      let schedule;
      if (body.schedule.kind === "cron") {
        if (!body.schedule.expr) {
          return reply.code(400).send({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Cron schedule requires 'expr' field" },
          });
        }
        schedule = { kind: "cron" as const, expr: body.schedule.expr, tz: body.schedule.tz };
      } else if (body.schedule.kind === "every") {
        if (!body.schedule.everyMs || body.schedule.everyMs < 1000) {
          return reply.code(400).send({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Every schedule requires 'everyMs' >= 1000" },
          });
        }
        schedule = { kind: "every" as const, everyMs: body.schedule.everyMs };
      } else if (body.schedule.kind === "at") {
        if (!body.schedule.at || body.schedule.at <= Date.now()) {
          return reply.code(400).send({
            ok: false,
            error: { code: "BAD_REQUEST", message: "At schedule requires 'at' timestamp in the future" },
          });
        }
        schedule = { kind: "at" as const, at: body.schedule.at };
      } else {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid schedule kind: must be 'cron', 'every', or 'at'" },
        });
      }

      try {
        const job = manager.createCronJob({
          name: body.name,
          schedule,
          prompt: body.prompt,
          channelId: body.channelId,
          sessionId: body.sessionId,
          enabled: body.enabled,
          deleteAfterRun: body.deleteAfterRun,
        });
        return reply.code(201).send({ ok: true, data: job });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ ok: false, error: { code: "CREATE_FAILED", message: msg } });
      }
    },
  );

  fastify.put(
    "/api/v1/cron/jobs/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          schedule?: { kind: string; expr?: string; everyMs?: number; at?: number; tz?: string };
          prompt?: string;
          channelId?: string | null;
          sessionId?: string | null;
          enabled?: boolean;
          deleteAfterRun?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const manager = app.getAutomationManager();
      if (!manager) {
        return reply.code(503).send({
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
        });
      }

      const body = request.body ?? {};
      const updates: Record<string, unknown> = {};

      if (body.name !== undefined) updates.name = body.name;
      if (body.prompt !== undefined) updates.prompt = body.prompt;
      if (body.channelId !== undefined) updates.channelId = body.channelId;
      if (body.sessionId !== undefined) updates.sessionId = body.sessionId;
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.deleteAfterRun !== undefined) updates.deleteAfterRun = body.deleteAfterRun;

      if (body.schedule) {
        let schedule;
        if (body.schedule.kind === "cron") {
          schedule = { kind: "cron" as const, expr: body.schedule.expr, tz: body.schedule.tz };
        } else if (body.schedule.kind === "every") {
          schedule = { kind: "every" as const, everyMs: body.schedule.everyMs };
        } else if (body.schedule.kind === "at") {
          schedule = { kind: "at" as const, at: body.schedule.at };
        }
        if (schedule) updates.schedule = schedule;
      }

      const job = manager.updateCronJob(request.params.id, updates as any);
      if (!job) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: `Cron job '${request.params.id}' not found` },
        });
      }

      return reply.send({ ok: true, data: job });
    },
  );

  fastify.delete("/api/v1/cron/jobs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const removed = manager.deleteCronJob(request.params.id);
    if (!removed) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: `Cron job '${request.params.id}' not found` },
      });
    }

    return reply.send({ ok: true, data: { deleted: true } });
  });

  fastify.post("/api/v1/cron/jobs/:id/run", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const result = await manager.runCronJobNow(request.params.id);
    if (!result) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: `Cron job '${request.params.id}' not found` },
      });
    }

    return reply.send({ ok: true, data: result });
  });

  fastify.get("/api/v1/workflows", async (_request: FastifyRequest, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const workflows = manager.listWorkflows();
    return reply.send({ ok: true, data: workflows });
  });

  fastify.post(
    "/api/v1/workflows/:id/run",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body?: { variables?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const manager = app.getAutomationManager();
      if (!manager) {
        return reply.code(503).send({
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
        });
      }

      try {
        const run = await manager.runWorkflow(request.params.id, request.body?.variables);
        return reply.send({ ok: true, data: run });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ ok: false, error: { code: "RUN_FAILED", message: msg } });
      }
    },
  );

  fastify.get("/api/v1/triggers", async (_request: FastifyRequest, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const rules = manager.listTriggerRules();
    return reply.send({ ok: true, data: rules });
  });

  fastify.get("/api/v1/events/history", async (request: FastifyRequest<{ Querystring: { event?: string; limit?: string } }>, reply: FastifyReply) => {
    const manager = app.getAutomationManager();
    if (!manager) {
      return reply.code(503).send({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Automation system not initialized" },
      });
    }

    const eventName = request.query.event as string | undefined;
    const limit = parseInt(request.query.limit ?? "50", 10);
    const history = manager.getEventBus().getHistory(eventName, limit);
    return reply.send({ ok: true, data: history });
  });
}

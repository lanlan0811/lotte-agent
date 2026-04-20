import type { FastifyInstance } from "fastify";
import type { GatewayDeps } from "../server.js";
import type { LotteApp } from "../../app.js";

export function registerNotificationRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  apiPrefix: string,
): void {
  const app: LotteApp = deps.app as LotteApp;

  fastify.get(`${apiPrefix}/notification/config`, async (_request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.send({ ok: true, data: { rules: [], webhook: { url: "", method: "POST", headers: {}, enabled: false }, email: { smtp_host: "", smtp_port: 587, from: "", to: [], enabled: false } } });
    }

    const rules = dispatcher.getRules();
    const webhookConfig = dispatcher.getWebhookConfig();
    const emailConfig = dispatcher.getEmailConfig();

    return reply.send({
      ok: true,
      data: {
        rules,
        webhook: webhookConfig,
        email: emailConfig,
      },
    });
  });

  fastify.post(`${apiPrefix}/notification/rules`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const body = request.body as {
      name: string;
      eventTypes: string[];
      channels: Array<{ type: string; target: string }>;
      enabled?: boolean;
    };

    const rule = dispatcher.addManagedRule({
      name: body.name,
      eventTypes: body.eventTypes,
      channels: body.channels as Array<{ type: "message" | "webhook" | "email"; target: string }>,
      enabled: body.enabled ?? true,
    });

    return reply.send({ ok: true, data: rule });
  });

  fastify.put(`${apiPrefix}/notification/rules/:ruleId`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const { ruleId } = request.params as { ruleId: string };
    const body = request.body as { enabled?: boolean; name?: string; eventTypes?: string[] };

    const rule = dispatcher.updateRule(ruleId, body);
    if (!rule) {
      return reply.status(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Rule '${ruleId}' not found` } });
    }

    return reply.send({ ok: true, data: rule });
  });

  fastify.delete(`${apiPrefix}/notification/rules/:ruleId`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const { ruleId } = request.params as { ruleId: string };
    const removed = dispatcher.removeRule(ruleId);
    return reply.send({ ok: removed });
  });

  fastify.put(`${apiPrefix}/notification/webhook`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const body = request.body as { url?: string; method?: string; headers?: Record<string, string>; enabled?: boolean };
    dispatcher.updateWebhookConfig(body);

    return reply.send({ ok: true });
  });

  fastify.put(`${apiPrefix}/notification/email`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const body = request.body as { smtp_host?: string; smtp_port?: number; from?: string; to?: string[]; enabled?: boolean };
    dispatcher.updateEmailConfig(body);

    return reply.send({ ok: true });
  });

  fastify.post(`${apiPrefix}/notification/test`, async (request, reply) => {
    const dispatcher = app.getNotificationDispatcher();
    if (!dispatcher) {
      return reply.status(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Notification dispatcher not initialized" } });
    }

    const body = request.body as { channel: string };
    try {
      await dispatcher.testChannel(body.channel);
      return reply.send({ ok: true });
    } catch (error) {
      return reply.send({ ok: false, error: { code: "TEST_FAILED", message: error instanceof Error ? error.message : "Test failed" } });
    }
  });
}

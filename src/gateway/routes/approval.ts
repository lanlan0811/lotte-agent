import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import type { EventEmitter } from "../events.js";
import { formatErrorMessage } from "../../errors/errors.js";

export function registerApprovalRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  events: EventEmitter,
  prefix: string,
): void {
  fastify.get(
    `${prefix}/approvals/pending`,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const approval = deps.app.getApprovalSystem();
        const pending = approval.getPendingRequests();

        reply.send({
          ok: true,
          data: {
            approvals: pending.map((p) => ({
              id: p.id,
              sessionId: p.sessionId,
              toolName: p.toolName,
              toolCategory: p.toolCategory,
              riskLevel: p.riskLevel,
              description: p.description,
              arguments: p.arguments,
              createdAt: p.createdAt,
              expiresAt: p.expiresAt,
            })),
            total: pending.length,
          },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "APPROVAL_LIST_ERROR", message: msg, details: null },
        });
      }
    },
  );

  fastify.post(
    `${prefix}/approvals/:id/approve`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const approval = deps.app.getApprovalSystem();
        const resolved = approval.decide(id, true);

        if (!resolved) {
          reply.status(404).send({
            ok: false,
            error: {
              code: "APPROVAL_NOT_FOUND",
              message: `Approval request not found: ${id}`,
              details: null,
            },
          });
          return;
        }

        events.emit("approval.resolved", { id, approved: true });

        reply.send({
          ok: true,
          data: { id, status: "approved" },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "APPROVAL_APPROVE_ERROR", message: msg, details: null },
        });
      }
    },
  );

  fastify.post(
    `${prefix}/approvals/:id/reject`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };

      try {
        const approval = deps.app.getApprovalSystem();
        const resolved = approval.decide(id, false, body?.reason);

        if (!resolved) {
          reply.status(404).send({
            ok: false,
            error: {
              code: "APPROVAL_NOT_FOUND",
              message: `Approval request not found: ${id}`,
              details: null,
            },
          });
          return;
        }

        events.emit("approval.resolved", { id, approved: false, reason: body?.reason });

        reply.send({
          ok: true,
          data: { id, status: "rejected", reason: body?.reason },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "APPROVAL_REJECT_ERROR", message: msg, details: null },
        });
      }
    },
  );
}

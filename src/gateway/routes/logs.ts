import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import { auditLog } from "../../tools/impl/audit-tool.js";
import { formatErrorMessage } from "../../errors/errors.js";

export function registerLogRoutes(
  fastify: FastifyInstance,
  _deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/logs`, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      sessionId?: string;
      toolName?: string;
      action?: string;
      result?: "success" | "failure" | "denied";
      startTime?: string;
      endTime?: string;
      limit?: string;
      offset?: string;
    };

    try {
      const results = auditLog.query({
        sessionId: query.sessionId,
        toolName: query.toolName,
        action: query.action,
        result: query.result,
        startTime: query.startTime ? parseInt(query.startTime, 10) : undefined,
        endTime: query.endTime ? parseInt(query.endTime, 10) : undefined,
        limit: query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });

      const stats = auditLog.getStats();

      reply.send({
        ok: true,
        data: {
          logs: results,
          total: stats.total,
          limit: query.limit ? parseInt(query.limit, 10) : 20,
          offset: query.offset ? parseInt(query.offset, 10) : 0,
        },
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "LOG_QUERY_ERROR", message: msg, details: null },
      });
    }
  });
}

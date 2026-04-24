import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import { formatErrorMessage } from "../../errors/errors.js";

export function registerSessionRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/sessions`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = deps.app.getDatabase().getDb();
      const sessions = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all();

      reply.send({ ok: true, data: { sessions } });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "SESSION_LIST_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.post(`${prefix}/sessions`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { model?: string; maxTurns?: number } | undefined;

    try {
      const app = deps.app;
      const session = app.createSession({
        model: body?.model,
        maxTurns: body?.maxTurns,
      });

      const db = app.getDatabase().getDb();
      db.prepare(
        "INSERT OR REPLACE INTO sessions (session_id, channel_id, title, status, model, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        session.id,
        "web",
        null,
        "active",
        session.config.model ?? "",
        Date.now(),
        Date.now(),
        JSON.stringify({ maxTurns: session.config.maxTurns }),
      );

      reply.status(201).send({
        ok: true,
        data: {
          id: session.id,
          model: session.config.model,
          maxTurns: session.config.maxTurns,
          status: "active",
          createdAt: Date.now(),
        },
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "SESSION_CREATE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(`${prefix}/sessions/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const app = deps.app;
      const session = app.getSession(id);
      if (!session) {
        reply.status(404).send({
          ok: false,
          error: { code: "SESSION_NOT_FOUND", message: `Session not found: ${id}`, details: null },
        });
        return;
      }

      reply.send({
        ok: true,
        data: {
          id: session.id,
          model: session.config.model,
          maxTurns: session.config.maxTurns,
          status: session.isActive() ? "active" : "inactive",
        },
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "SESSION_GET_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.delete(`${prefix}/sessions/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const app = deps.app;
      const session = app.getSession(id);
      if (!session) {
        reply.status(404).send({
          ok: false,
          error: { code: "SESSION_NOT_FOUND", message: `Session not found: ${id}`, details: null },
        });
        return;
      }

      session.abort();

      const db = app.getDatabase().getDb();
      db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?").run(
        "deleted",
        Date.now(),
        id,
      );

      reply.send({ ok: true, data: { id, status: "deleted" } });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "SESSION_DELETE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(
    `${prefix}/sessions/:id/messages`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit ?? "50", 10), 200);
      const offset = parseInt(query.offset ?? "0", 10);

      try {
        const db = deps.app.getDatabase().getDb();
        const messages = db
          .prepare(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?",
          )
          .all(id, limit, offset);

        const row = db
          .prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?")
          .get(id) as { count: number } | undefined;

        reply.send({
          ok: true,
          data: {
            messages,
            total: row?.count ?? 0,
            limit,
            offset,
          },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "MESSAGES_GET_ERROR", message: msg, details: null },
        });
      }
    },
  );

  fastify.post(
    `${prefix}/sessions/:id/compact`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const app = deps.app;
        const session = app.getSession(id);
        if (!session) {
          reply.status(404).send({
            ok: false,
            error: { code: "SESSION_NOT_FOUND", message: `Session not found: ${id}`, details: null },
          });
          return;
        }

        const compactor = app.getCompactor();
        const memory = app.getMemoryManager();
        const messages = memory.getShortTerm().getMessages();
        const maxTokens = session.config.maxTokens ?? 128000;
        const compacted = await compactor.compact(messages, maxTokens);

        reply.send({
          ok: true,
          data: {
            sessionId: id,
            originalCount: compacted.originalMessageCount,
            compactedCount: compacted.compressedMessageCount,
            tokensSaved: compacted.tokensSaved,
          },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "COMPACT_ERROR", message: msg, details: null },
        });
      }
    },
  );
}

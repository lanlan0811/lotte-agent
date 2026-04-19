import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import type { EventEmitter } from "../events.js";

export function registerChatRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  events: EventEmitter,
  prefix: string,
): void {
  fastify.post(`${prefix}/chat/send`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      sessionId: string;
      message: string;
      stream?: boolean;
    };

    if (!body.sessionId || !body.message) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "sessionId and message are required",
          details: null,
        },
      });
      return;
    }

    const app = deps.app;
    const session = app.getSession(body.sessionId);
    if (!session) {
      reply.status(404).send({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Session not found: ${body.sessionId}`,
          details: null,
        },
      });
      return;
    }

    if (body.stream) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const sendSSE = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        sendSSE("message", { type: "start", sessionId: body.sessionId });

        events.emit("agent.message", {
          sessionId: body.sessionId,
          type: "user",
          content: body.message,
        });

        const result = await app.chat(body.sessionId, body.message);

        sendSSE("message", { type: "text", content: result.response });
        events.emit("agent.message", {
          sessionId: body.sessionId,
          type: "assistant",
          content: result.response,
        });

        sendSSE("done", {
          type: "done",
          usage: { promptTokens: 0, completionTokens: result.totalTokens },
          turns: result.turns,
          finished: result.finished,
          finishReason: result.finishReason,
        });
        events.emit("agent.done", { sessionId: body.sessionId });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        sendSSE("error", { type: "error", message: msg });
        events.emit("agent.error", { sessionId: body.sessionId, error: msg });
      }

      reply.raw.end();
    } else {
      try {
        const result = await app.chat(body.sessionId, body.message);

        reply.send({
          ok: true,
          data: {
            sessionId: body.sessionId,
            response: result.response,
            toolCallsMade: result.toolCallsMade,
            totalTokens: result.totalTokens,
            turns: result.turns,
            finished: result.finished,
            finishReason: result.finishReason,
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        reply.status(500).send({
          ok: false,
          error: { code: "CHAT_ERROR", message: msg, details: null },
        });
      }
    }
  });

  fastify.post(`${prefix}/chat/abort`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { sessionId: string };
    const app = deps.app;

    if (!body.sessionId) {
      reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "sessionId is required",
          details: null,
        },
      });
      return;
    }

    const session = app.getSession(body.sessionId);
    if (!session) {
      reply.status(404).send({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Session not found: ${body.sessionId}`,
          details: null,
        },
      });
      return;
    }

    session.abort();
    events.emit("agent.done", { sessionId: body.sessionId, aborted: true });

    reply.send({ ok: true, data: { sessionId: body.sessionId, aborted: true } });
  });
}

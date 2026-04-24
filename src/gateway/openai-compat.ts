import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "./server.js";
import type { EventEmitter } from "./events.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

interface ChatCompletionRequest {
  model?: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }>;
}

interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: "stop" | "tool_calls" | "length";
}

interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function registerOpenAICompatRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  events: EventEmitter,
): void {
  fastify.get("/v1/models", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const modelManager = deps.app.getModelManager();
      const models = modelManager.listAllModels();

      reply.send({
        object: "list",
        data: models.map((m) => ({
          id: m.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: m.provider,
        })),
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        error: { message: msg, type: "internal_error", code: "MODEL_LIST_ERROR" },
      });
    }
  });

  fastify.post(
    "/v1/chat/completions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as ChatCompletionRequest;

      if (!body.messages || body.messages.length === 0) {
        reply.status(400).send({
          error: {
            message: "messages is required and must not be empty",
            type: "invalid_request_error",
            code: "VALIDATION_ERROR",
          },
        });
        return;
      }

      const app = deps.app;
      const modelManager = app.getModelManager();
      const requestedModel = body.model ?? modelManager.getDefaultModel();

      try {
        const session = app.createSession({ model: requestedModel });

        const lastUserMessage = body.messages
          .filter((m) => m.role === "user")
          .pop();

        if (!lastUserMessage) {
          reply.status(400).send({
            error: {
              message: "At least one user message is required",
              type: "invalid_request_error",
              code: "VALIDATION_ERROR",
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

          const completionId = `chatcmpl-${session.id}`;
          const created = Math.floor(Date.now() / 1000);

          const sendSSEChunk = (data: unknown) => {
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
          };

          try {
            sendSSEChunk({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: requestedModel,
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: "" },
                  finish_reason: null,
                },
              ],
            });

            const result = await app.chat(session.id, lastUserMessage.content);

            if (result.response) {
              sendSSEChunk({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: requestedModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: result.response },
                    finish_reason: null,
                  },
                ],
              });

              events.emit("agent.message", {
                sessionId: session.id,
                type: "assistant",
                content: result.response,
              });
            }

            const finishReason = result.toolCallsMade > 0 ? "tool_calls" : "stop";

            sendSSEChunk({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: requestedModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: finishReason,
                },
              ],
            });

            reply.raw.write("data: [DONE]\n\n");
            events.emit("agent.done", { sessionId: session.id });
          } catch (error) {
            const msg = formatErrorMessage(error);
            sendSSEChunk({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: requestedModel,
              choices: [
                {
                  index: 0,
                  delta: { content: `Error: ${msg}` },
                  finish_reason: "stop",
                },
              ],
            });
            reply.raw.write("data: [DONE]\n\n");
          }

          reply.raw.end();
        } else {
          const result = await app.chat(session.id, lastUserMessage.content);

          const finishReason = result.toolCallsMade > 0 ? "tool_calls" : "stop";

          const response: ChatCompletionResponse = {
            id: `chatcmpl-${session.id}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: requestedModel,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: result.response ?? null,
                },
                finish_reason: finishReason,
              },
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: result.totalTokens,
              total_tokens: result.totalTokens,
            },
          };

          events.emit("agent.done", { sessionId: session.id });
          reply.send(response);
        }
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.error(`OpenAI compat error: ${msg}`);
        reply.status(500).send({
          error: { message: msg, type: "internal_error", code: "CHAT_ERROR" },
        });
      }
    },
  );
}

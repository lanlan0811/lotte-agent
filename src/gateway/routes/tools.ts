import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";
import { formatErrorMessage } from "../../errors/errors.js";

export function registerToolRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/tools`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const registry = deps.app.getToolRegistry();
      const tools = registry.listAll();
      const categories = registry.listCategories();

      reply.send({
        ok: true,
        data: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            requiresApproval: t.requiresApproval,
            dangerous: t.dangerous,
            readOnly: t.readOnly,
          })),
          categories,
          total: tools.length,
        },
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "TOOLS_LIST_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(`${prefix}/tools/:name`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };

    try {
      const registry = deps.app.getToolRegistry();
      const tool = registry.get(name);

      if (!tool) {
        reply.status(404).send({
          ok: false,
          error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${name}`, details: null },
        });
        return;
      }

      reply.send({
        ok: true,
        data: {
          name: tool.name,
          description: tool.description,
          category: tool.category,
          requiresApproval: tool.requiresApproval,
          dangerous: tool.dangerous,
          readOnly: tool.readOnly,
          parameters: Object.entries(tool.parameters.shape).map(([key, schema]) => {
            const s = schema as { description?: string; isOptional?: () => boolean };
            return {
              name: key,
              description: s.description ?? "",
              optional: typeof s.isOptional === "function" ? s.isOptional() : true,
            };
          }),
        },
      });
    } catch (error) {
      const msg = formatErrorMessage(error);
      reply.status(500).send({
        ok: false,
        error: { code: "TOOL_GET_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.post(
    `${prefix}/tools/:name/invoke`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      const args = (request.body as { args?: Record<string, unknown> })?.args ?? {};

      try {
        const registry = deps.app.getToolRegistry();
        const tool = registry.get(name);

        if (!tool) {
          reply.status(404).send({
            ok: false,
            error: { code: "TOOL_NOT_FOUND", message: `Tool not found: ${name}`, details: null },
          });
          return;
        }

        if (tool.requiresApproval) {
          reply.status(202).send({
            ok: true,
            data: {
              status: "pending_approval",
              message: `Tool "${name}" requires approval. Use /api/v1/approvals endpoints to manage approvals.`,
            },
          });
          return;
        }

        const result = await tool.execute(args);

        reply.send({
          ok: true,
          data: { tool: name, result },
        });
      } catch (error) {
        const msg = formatErrorMessage(error);
        reply.status(500).send({
          ok: false,
          error: { code: "TOOL_INVOKE_ERROR", message: msg, details: null },
        });
      }
    },
  );
}

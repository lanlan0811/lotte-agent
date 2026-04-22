import type { FastifyInstance } from "fastify";
import type { GatewayDeps } from "../server.js";
import type { EventEmitter } from "../events.js";
import { registerSessionRoutes } from "./session.js";
import { registerChatRoutes } from "./chat.js";
import { registerConfigRoutes } from "./config.js";
import { registerToolRoutes } from "./tools.js";
import { registerApprovalRoutes } from "./approval.js";
import { registerLogRoutes } from "./logs.js";
import { registerHealthRoutes } from "./health.js";
import { registerMCPRoutes } from "./mcp.js";
import { registerSkillRoutes } from "./skills.js";
import { registerPluginRoutes } from "./plugins.js";
import { registerChannelRoutes } from "./channels.js";
import { registerAutomationRoutes } from "./automation.js";
import { registerRAGRoutes } from "./rag.js";
import { registerNotificationRoutes } from "./notification.js";
import { registerMediaGatewayRoutes } from "./media.js";
import { registerOpenAICompatRoutes } from "../openai-compat.js";

export function registerRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  events: EventEmitter,
): void {
  registerHealthRoutes(fastify, deps);

  const apiPrefix = "/api/v1";

  registerSessionRoutes(fastify, deps, apiPrefix);
  registerChatRoutes(fastify, deps, events, apiPrefix);
  registerConfigRoutes(fastify, deps, apiPrefix);
  registerToolRoutes(fastify, deps, apiPrefix);
  registerApprovalRoutes(fastify, deps, events, apiPrefix);
  registerLogRoutes(fastify, deps, apiPrefix);
  registerMCPRoutes(fastify, deps, apiPrefix);
  registerSkillRoutes(fastify, deps, apiPrefix);
  registerPluginRoutes(fastify, deps);
  registerChannelRoutes(fastify, deps);
  registerAutomationRoutes(fastify, deps);
  registerRAGRoutes(fastify, deps, apiPrefix);
  registerNotificationRoutes(fastify, deps, apiPrefix);
  registerMediaGatewayRoutes(fastify, deps);

  registerOpenAICompatRoutes(fastify, deps, events);
}

import type { FastifyInstance } from "fastify";
import type { GatewayDeps } from "../server.js";
import { registerMediaRoutes } from "../../multimodal/media/store.js";

export function registerMediaGatewayRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
): void {
  const multimodalManager = deps.app.getMultimodalManager();
  if (!multimodalManager) {
    return;
  }

  const store = multimodalManager.getMediaStore();
  registerMediaRoutes(fastify, store, "/media");
}

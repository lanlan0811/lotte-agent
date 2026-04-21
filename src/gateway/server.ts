import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { GatewayConfig } from "../config/schema.js";
import type { LotteApp } from "../app.js";
import type { PluginRegistry, PluginLoader } from "../plugins/index.js";
import { logger } from "../utils/logger.js";
import { registerAuthMiddleware, type AuthResult } from "./auth.js";
import { registerRoutes } from "./routes/index.js";
import { WebSocketManager } from "./websocket.js";
import { EventEmitter } from "./events.js";

export interface GatewayDeps {
  app: LotteApp;
  config: GatewayConfig;
  pluginRegistry?: PluginRegistry;
  pluginLoader?: PluginLoader;
  serveStatic?: boolean;
}

export interface GatewayContext {
  app: LotteApp;
  auth: AuthResult;
}

const API_PREFIXES = ["/api/", "/v1/", "/ws"];

export class Gateway {
  private fastify: FastifyInstance;
  private wsManager: WebSocketManager | null = null;
  private eventEmitter: EventEmitter;
  private deps: GatewayDeps;
  private running = false;

  constructor(deps: GatewayDeps) {
    this.deps = deps;
    this.fastify = Fastify({
      logger: false,
      bodyLimit: 10 * 1024 * 1024,
      requestTimeout: 60000,
      ignoreTrailingSlash: true,
    });
    this.eventEmitter = new EventEmitter();
  }

  async start(): Promise<void> {
    if (this.running) return;

    const { config } = this.deps;

    await this.fastify.register(cors, {
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      credentials: true,
    });

    registerAuthMiddleware(this.fastify, config);

    this.fastify.addHook("onRequest", async (request: FastifyRequest) => {
      request.headers["x-request-id"] ??= crypto.randomUUID();
    });

    this.fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
      const duration = reply.elapsedTime;
      const method = request.method;
      const url = request.url;
      const status = reply.statusCode;
      logger.debug(`${method} ${url} -> ${status} (${duration.toFixed(0)}ms)`);
    });

    this.fastify.setErrorHandler((error, request, reply) => {
      const err = error as Error & { statusCode?: number };
      logger.error(`Request error: ${request.method} ${request.url}: ${err.message}`);

      const statusCode = err.statusCode ?? 500;
      const isValidation = statusCode === 400;

      reply.status(statusCode).send({
        ok: false,
        error: {
          code: isValidation ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
          message: isValidation ? err.message : "Internal server error",
          details: process.env["NODE_ENV"] === "development" ? err.stack : null,
        },
      });
    });

    registerRoutes(this.fastify, this.deps, this.eventEmitter);

    if (this.deps.serveStatic) {
      await this.registerStaticServing();
    }

    this.wsManager = new WebSocketManager(this.deps, this.eventEmitter);

    const address = config.host;
    const port = config.port;

    await this.fastify.listen({ host: address, port });

    this.wsManager.attach(this.fastify.server);

    this.running = true;
    logger.info(`Gateway started on http://${address}:${port}`);
    logger.info(`WebSocket available at ws://${address}:${port}/ws`);

    if (this.deps.serveStatic) {
      logger.info(`Web UI available at http://${address}:${port}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    logger.info("Gateway stopping...");

    if (this.wsManager) {
      this.wsManager.close();
      this.wsManager = null;
    }

    await this.fastify.close();
    this.running = false;
    logger.info("Gateway stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  getWebSocketManager(): WebSocketManager | null {
    return this.wsManager;
  }

  getAddress(): string {
    return `http://${this.deps.config.host}:${this.deps.config.port}`;
  }

  private async registerStaticServing(): Promise<void> {
    const webDir = path.resolve(import.meta.dirname, "../../dist/web");

    if (!fs.existsSync(webDir)) {
      logger.warn(
        `Web static directory not found: ${webDir}. Run 'pnpm build:web' first.`,
      );
      return;
    }

    await this.fastify.register(fastifyStatic, {
      root: webDir,
      prefix: "/",
      decorateReply: false,
      wildcard: false,
    });

    this.fastify.setNotFoundHandler((request, reply) => {
      if (API_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
        reply.status(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Route not found: ${request.method} ${request.url}`,
            details: null,
          },
        });
        return;
      }

      const indexPath = path.join(webDir, "index.html");
      if (fs.existsSync(indexPath)) {
        reply.type("text/html").send(fs.readFileSync(indexPath));
      } else {
        reply.status(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Web UI not available",
            details: null,
          },
        });
      }
    });

    logger.info(`Serving static web from: ${webDir}`);
  }
}

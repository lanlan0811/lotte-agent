import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import type { GatewayConfig } from "../config/schema.js";
import { logger } from "../utils/logger.js";

export interface AuthResult {
  authenticated: boolean;
  method?: "none" | "token" | "password";
  user?: string;
  reason?: string;
}

export interface AuthConfig {
  mode: "token" | "password" | "none";
  token: string;
  password: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthResult;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") return null;

  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer") {
    return parts[1] ?? null;
  }
  return null;
}

function extractBasicAuth(request: FastifyRequest): { username: string; password: string } | null {
  const authHeader = request.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "basic") return null;

  try {
    const decoded = Buffer.from(parts[1] ?? "", "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;
    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}

export function authenticateRequest(request: FastifyRequest, config: AuthConfig): AuthResult {
  if (config.mode === "none") {
    return { authenticated: true, method: "none" };
  }

  if (config.mode === "token") {
    const token = extractBearerToken(request);
    if (!token) {
      return { authenticated: false, reason: "Missing bearer token" };
    }
    if (!config.token) {
      return { authenticated: false, reason: "Server token not configured" };
    }
    if (safeEqual(token, config.token)) {
      return { authenticated: true, method: "token", user: "token-user" };
    }
    return { authenticated: false, reason: "Invalid token" };
  }

  if (config.mode === "password") {
    const basic = extractBasicAuth(request);
    if (!basic) {
      const token = extractBearerToken(request);
      if (token && config.token && safeEqual(token, config.token)) {
        return { authenticated: true, method: "token", user: "token-user" };
      }
      return { authenticated: false, reason: "Missing authentication credentials" };
    }
    if (!config.password) {
      return { authenticated: false, reason: "Server password not configured" };
    }
    if (safeEqual(basic.password, config.password)) {
      return { authenticated: true, method: "password", user: basic.username || "password-user" };
    }
    return { authenticated: false, reason: "Invalid password" };
  }

  return { authenticated: false, reason: "Unknown auth mode" };
}

const PUBLIC_PATHS = [
  "/v1/chat/completions",
  "/v1/models",
  "/health",
];

function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.some((p) => url.startsWith(p));
}

export function registerAuthMiddleware(fastify: FastifyInstance, config: GatewayConfig): void {
  const authConfig: AuthConfig = {
    mode: config.auth.mode,
    token: config.auth.token,
    password: config.auth.password,
  };

  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicPath(request.url)) {
      request.auth = { authenticated: true, method: "none" };
      return;
    }

    const result = authenticateRequest(request, authConfig);
    request.auth = result;

    if (!result.authenticated) {
      logger.warn(`Auth failed: ${request.method} ${request.url} - ${result.reason}`);

      const wwwAuthenticate = authConfig.mode === "token"
        ? 'Bearer realm="Lotte Agent"'
        : 'Basic realm="Lotte Agent"';

      void reply.header("WWW-Authenticate", wwwAuthenticate);
      void reply.status(401).send({
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: result.reason ?? "Authentication required",
          details: null,
        },
      });
    }
  });
}

import type { Server } from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { GatewayDeps } from "./server.js";
import type { EventEmitter } from "./events.js";
import { formatErrorMessage } from "../errors/errors.js";
import type { AuthConfig, AuthResult } from "./auth.js";
import { logger } from "../utils/logger.js";

export interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number | null;
  };
}

export interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq: number;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

export interface ClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: string;
}

interface ChallengeState {
  nonce: string;
  issuedAt: number;
  resolved: boolean;
}

interface ConnectedClient {
  ws: WebSocket;
  clientInfo: ClientInfo | null;
  authenticated: boolean;
  connectedAt: number;
  lastActivity: number;
  challenge: ChallengeState | null;
  handshakeTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_PAYLOAD = 5 * 1024 * 1024;
const TICK_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MULTIPLIER = 2;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const MIN_CHALLENGE_TIMEOUT_MS = 250;
const MAX_CHALLENGE_TIMEOUT_MS = DEFAULT_HANDSHAKE_TIMEOUT_MS;
const CHALLENGE_NONCE_BYTES = 32;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function clampChallengeTimeoutMs(timeoutMs: number): number {
  return Math.max(MIN_CHALLENGE_TIMEOUT_MS, Math.min(MAX_CHALLENGE_TIMEOUT_MS, timeoutMs));
}

function resolveHandshakeTimeoutMs(timeoutMs?: number | null): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) {
    return clampChallengeTimeoutMs(timeoutMs);
  }
  return DEFAULT_HANDSHAKE_TIMEOUT_MS;
}

function computeHmacResponse(nonce: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(nonce).digest("hex");
}

function verifyChallengeResponse(nonce: string, secret: string, response: string): boolean {
  const expected = computeHmacResponse(nonce, secret);
  return safeEqual(expected, response);
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private deps: GatewayDeps;
  private events: EventEmitter;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private seq = 0;

  constructor(deps: GatewayDeps, events: EventEmitter) {
    this.deps = deps;
    this.events = events;
  }

  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      maxPayload: MAX_PAYLOAD,
    });

    this.wss.on("connection", (ws, _req) => {
      this.handleConnection(ws);
    });

    this.wss.on("error", (error) => {
      logger.error(`WebSocket server error: ${error.message}`);
    });

    this.tickInterval = setInterval(() => {
      this.sendTick();
      this.checkHeartbeats();
    }, TICK_INTERVAL_MS);

    this.events.on("agent.message", (payload) => {
      this.broadcastEvent("agent.message", payload);
    });

    this.events.on("agent.done", (payload) => {
      this.broadcastEvent("agent.done", payload);
    });

    this.events.on("agent.error", (payload) => {
      this.broadcastEvent("agent.error", payload);
    });

    this.events.on("approval.resolved", (payload) => {
      this.broadcastEvent("approval.request", payload);
    });

    this.events.on("config.changed", (payload) => {
      this.broadcastEvent("config.changed", payload);
    });

    logger.info("WebSocket manager attached to server");
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = crypto.randomUUID();
    const client: ConnectedClient = {
      ws,
      clientInfo: null,
      authenticated: false,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      challenge: null,
      handshakeTimer: null,
    };

    this.clients.set(clientId, client);
    logger.info(`WebSocket client connected: ${clientId} (total: ${this.clients.size})`);

    this.startHandshake(clientId);

    ws.on("message", (data: RawData) => {
      const raw = data.toString();

      if (raw === "ping") {
        client.lastActivity = Date.now();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("pong");
        }
        return;
      }

      try {
        const message = JSON.parse(raw) as GatewayFrame;
        this.handleMessage(clientId, message);
      } catch (e) {
        logger.debug(`Failed to parse WebSocket message from client ${clientId}: ${e}`);
        this.sendError(clientId, "", "PARSE_ERROR", "Invalid JSON message");
      }
    });

    ws.on("close", (code) => {
      this.clearHandshakeTimer(clientId);
      this.clients.delete(clientId);
      logger.info(`WebSocket client disconnected: ${clientId} (code: ${code}, total: ${this.clients.size})`);
    });

    ws.on("error", (error) => {
      this.clearHandshakeTimer(clientId);
      logger.error(`WebSocket client error (${clientId}): ${error.message}`);
      this.clients.delete(clientId);
    });

    ws.on("ping", () => {
      client.lastActivity = Date.now();
    });

    ws.on("pong", () => {
      client.lastActivity = Date.now();
    });
  }

  private resolveEffectiveAuthMode(): "token" | "password" | "none" {
    const authConfig = this.deps.config.auth;
    if (authConfig.mode === "none") return "none";
    if (authConfig.mode === "token" && !authConfig.token) return "none";
    if (authConfig.mode === "password" && !authConfig.password) return "none";
    return authConfig.mode;
  }

  private startHandshake(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const effectiveMode = this.resolveEffectiveAuthMode();

    if (effectiveMode === "none") {
      client.authenticated = true;
      client.clientInfo = { id: "anonymous", version: "0.0.0", platform: "unknown", mode: "default" };
      this.sendResponse(clientId, "", true, {
        type: "hello-ok",
        protocol: 1,
        server: { version: "0.1.0", connId: clientId },
        features: this.getFeatures(),
        policy: this.getPolicy(),
      });
      return;
    }

    const nonce = crypto.randomBytes(CHALLENGE_NONCE_BYTES).toString("hex");
    client.challenge = { nonce, issuedAt: Date.now(), resolved: false };

    const handshakeTimeout = resolveHandshakeTimeoutMs(
      (this.deps.config as Record<string, unknown>).handshakeTimeoutMs as number | undefined,
    );

    client.handshakeTimer = setTimeout(() => {
      const c = this.clients.get(clientId);
      if (c && !c.authenticated) {
        logger.warn(`WebSocket handshake timeout: ${clientId}`);
        c.ws.close(4002, "Handshake timeout");
        this.clients.delete(clientId);
      }
    }, handshakeTimeout);

    this.sendResponse(clientId, "", true, {
      type: "challenge",
      protocol: 1,
      nonce,
      methods: effectiveMode === "token" ? ["hmac-token"] : ["hmac-password"],
      timeoutMs: handshakeTimeout,
    });
  }

  private clearHandshakeTimer(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client?.handshakeTimer) {
      clearTimeout(client.handshakeTimer);
      client.handshakeTimer = null;
    }
  }

  private getFeatures() {
    return {
      methods: [
        "connect",
        "chat.send",
        "chat.abort",
        "sessions.list",
        "sessions.create",
        "sessions.delete",
        "sessions.compact",
        "config.get",
        "config.set",
        "tools.catalog",
        "tools.invoke",
        "approval.pending",
        "approval.resolve",
        "logs.tail",
      ],
      events: [
        "tick",
        "agent.message",
        "agent.done",
        "agent.error",
        "approval.request",
        "config.changed",
        "shutdown",
      ],
    };
  }

  private getPolicy() {
    return {
      maxPayload: MAX_PAYLOAD,
      maxBufferedBytes: 1024 * 1024,
      tickIntervalMs: TICK_INTERVAL_MS,
    };
  }

  private handleMessage(clientId: string, frame: GatewayFrame): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();

    if (frame.type === "req") {
      void this.handleRequest(clientId, frame as RequestFrame);
    }
  }

  private async handleRequest(clientId: string, frame: RequestFrame): Promise<void> {
    const { id, method, params } = frame;

    if (method === "connect") {
      await this.handleConnect(clientId, id, params as Record<string, unknown>);
      return;
    }

    const client = this.clients.get(clientId);
    if (!client?.authenticated) {
      this.sendResponse(clientId, id, false, undefined, {
        code: "AUTH_REQUIRED",
        message: "Authentication required. Call connect first.",
      });
      return;
    }

    try {
      const result = await this.dispatchMethod(method, params);
      this.sendResponse(clientId, id, true, result);
    } catch (error) {
      const msg = formatErrorMessage(error);
      this.sendResponse(clientId, id, false, undefined, {
        code: "METHOD_ERROR",
        message: msg,
      });
    }
  }

  private async handleConnect(
    clientId: string,
    requestId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const authParams = params?.auth as { token?: string; password?: string; challengeResponse?: string; method?: string } | undefined;
    const clientParams = params?.client as { id?: string; version?: string; platform?: string; mode?: string } | undefined;

    const effectiveMode = this.resolveEffectiveAuthMode();

    let authResult: AuthResult;

    if (effectiveMode === "none") {
      authResult = { authenticated: true, method: "none" };
    } else if (authParams?.challengeResponse && client.challenge && !client.challenge.resolved) {
      const authConfig: AuthConfig = {
        mode: this.deps.config.auth.mode,
        token: this.deps.config.auth.token,
        password: this.deps.config.auth.password,
      };
      const secret = authConfig.mode === "token" ? authConfig.token : authConfig.password;
      if (!secret) {
        authResult = { authenticated: false, reason: "Server secret not configured" };
      } else if (verifyChallengeResponse(client.challenge.nonce, secret, authParams.challengeResponse)) {
        client.challenge.resolved = true;
        authResult = {
          authenticated: true,
          method: authConfig.mode === "token" ? "token" : "password",
          user: `${authConfig.mode}-user`,
        };
      } else {
        authResult = { authenticated: false, reason: "Invalid challenge response" };
      }
    } else if (authParams?.token) {
      const authConfig: AuthConfig = {
        mode: this.deps.config.auth.mode,
        token: this.deps.config.auth.token,
        password: this.deps.config.auth.password,
      };
      if (authConfig.token && safeEqual(authParams.token, authConfig.token)) {
        authResult = { authenticated: true, method: "token", user: "token-user" };
      } else {
        authResult = { authenticated: false, reason: "Invalid token" };
      }
    } else if (authParams?.password) {
      const authConfig: AuthConfig = {
        mode: this.deps.config.auth.mode,
        token: this.deps.config.auth.token,
        password: this.deps.config.auth.password,
      };
      if (authConfig.password && safeEqual(authParams.password, authConfig.password)) {
        authResult = { authenticated: true, method: "password", user: "password-user" };
      } else {
        authResult = { authenticated: false, reason: "Invalid password" };
      }
    } else {
      authResult = { authenticated: false, reason: "Missing authentication credentials" };
    }

    if (!authResult.authenticated) {
      this.sendResponse(clientId, requestId, false, undefined, {
        code: "AUTH_FAILED",
        message: authResult.reason ?? "Authentication failed",
      });
      client.ws.close(4001, "Authentication failed");
      return;
    }

    this.clearHandshakeTimer(clientId);
    client.authenticated = true;
    client.clientInfo = {
      id: clientParams?.id ?? "unknown",
      version: clientParams?.version ?? "0.0.0",
      platform: clientParams?.platform ?? "unknown",
      mode: clientParams?.mode ?? "default",
    };

    this.sendResponse(clientId, requestId, true, {
      type: "hello-ok",
      protocol: 1,
      server: {
        version: "0.1.0",
        connId: clientId,
      },
      features: this.getFeatures(),
      policy: this.getPolicy(),
    });

    logger.info(`WebSocket client authenticated: ${clientId} (${client.clientInfo.id})`);
  }

  private async dispatchMethod(
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const app = this.deps.app;

    switch (method) {
      case "sessions.list": {
        const db = app.getDatabase().getDb();
        const sessions = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all();
        return { sessions };
      }

      case "sessions.create": {
        const p = params as { model?: string; maxTurns?: number };
        const session = app.createSession({ model: p.model, maxTurns: p.maxTurns });
        return {
          id: session.id,
          model: session.config.model,
          maxTurns: session.config.maxTurns,
          status: "active",
        };
      }

      case "sessions.delete": {
        const p = params as { sessionId: string };
        const session = app.getSession(p.sessionId);
        if (session) session.abort();
        return { id: p.sessionId, status: "deleted" };
      }

      case "sessions.compact": {
        const p = params as { sessionId: string; maxTokens?: number };
        const compactor = app.getCompactor();
        const memory = app.getMemoryManager();
        const messages = memory.getShortTerm().getMessages();
        const maxTokens = p.maxTokens ?? 128000;
        const compacted = await compactor.compact(messages, maxTokens);
        return {
          sessionId: p.sessionId,
          originalCount: compacted.originalMessageCount,
          compactedCount: compacted.compressedMessageCount,
          tokensSaved: compacted.tokensSaved,
        };
      }

      case "chat.send": {
        const p = params as { sessionId: string; message: string };
        const result = await app.chat(p.sessionId, p.message);
        return {
          sessionId: p.sessionId,
          response: result.response,
          toolCallsMade: result.toolCallsMade,
          totalTokens: result.totalTokens,
          turns: result.turns,
          finished: result.finished,
          finishReason: result.finishReason,
        };
      }

      case "chat.abort": {
        const p = params as { sessionId: string };
        const session = app.getSession(p.sessionId);
        if (session) session.abort();
        return { sessionId: p.sessionId, aborted: true };
      }

      case "config.get": {
        const p = params as { module: string };
        const config = app.getConfig();
        switch (p.module) {
          case "main": return config.getMain();
          case "ai": return config.getAI();
          case "gateway": return config.getGateway();
          default: return null;
        }
      }

      case "config.set": {
        const p = params as { module: string; data: Record<string, unknown> };
        const config = app.getConfig();
        await config.saveModule(p.module, p.data);
        return { module: p.module, updated: true };
      }

      case "tools.catalog": {
        const registry = app.getToolRegistry();
        const tools = registry.listAll();
        return {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            requiresApproval: t.requiresApproval,
          })),
        };
      }

      case "tools.invoke": {
        const p = params as { name: string; args: Record<string, unknown> };
        const registry = app.getToolRegistry();
        const tool = registry.get(p.name);
        if (!tool) throw new Error(`Tool not found: ${p.name}`);
        return { tool: p.name, result: await tool.execute(p.args) };
      }

      case "approval.pending": {
        const approval = app.getApprovalSystem();
        return { approvals: approval.getPendingRequests() };
      }

      case "approval.resolve": {
        const p = params as { id: string; approved: boolean; reason?: string };
        const approval = app.getApprovalSystem();
        approval.decide(p.id, p.approved, p.reason);
        return { id: p.id, approved: p.approved };
      }

      case "logs.tail": {
        const { auditLog } = await import("../tools/impl/audit-tool.js");
        const entries = auditLog.query({ limit: 20 });
        return { logs: entries };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private sendResponse(
    clientId: string,
    requestId: string,
    ok: boolean,
    payload?: unknown,
    error?: { code: string; message: string; details?: unknown },
  ): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    const frame: ResponseFrame = {
      type: "res",
      id: requestId,
      ok,
      ...(payload !== undefined && { payload }),
      ...(error && { error }),
    };

    client.ws.send(JSON.stringify(frame));
  }

  private sendError(clientId: string, requestId: string, code: string, message: string): void {
    this.sendResponse(clientId, requestId, false, undefined, { code, message });
  }

  private broadcastEvent(event: string, payload: unknown): void {
    this.seq++;
    const frame: EventFrame = {
      type: "event",
      event,
      payload,
      seq: this.seq,
    };

    const data = JSON.stringify(frame);
    for (const [, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  private sendTick(): void {
    this.broadcastEvent("tick", { ts: Date.now() });
  }

  private checkHeartbeats(): void {
    const timeout = TICK_INTERVAL_MS * HEARTBEAT_TIMEOUT_MULTIPLIER;
    const now = Date.now();

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity > timeout) {
        logger.warn(`WebSocket heartbeat timeout: ${clientId}`);
        client.ws.close(4000, "Heartbeat timeout");
        this.clients.delete(clientId);
      }
    }
  }

  getConnectedCount(): number {
    return this.clients.size;
  }

  getAuthenticatedCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.authenticated) count++;
    }
    return count;
  }

  close(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    for (const [, client] of this.clients) {
      const frame: EventFrame = {
        type: "event",
        event: "shutdown",
        payload: { reason: "Server shutting down" },
        seq: ++this.seq,
      };
      try {
        client.ws.send(JSON.stringify(frame));
        client.ws.close(1000, "Server shutting down");
      } catch (e) {
        logger.debug(`Failed to close WebSocket client: ${e}`);
      }
    }

    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info("WebSocket manager closed");
  }
}

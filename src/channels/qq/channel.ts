import { BaseChannel } from "../base.js";
import type {
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
  MessageContent,
} from "../types.js";
import { MessageRenderer } from "../renderer.js";
import { logger } from "../../utils/logger.js";
import type { ChannelsConfig } from "../../config/schema.js";

type QQConfig = ChannelsConfig["qq"];

const DEFAULT_API_BASE = "https://api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RECONNECT = 7;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

const INTENT_PUBLIC_GUILD_MESSAGES = 1 << 30;
const INTENT_DIRECT_MESSAGE = 1 << 12;
const INTENT_GROUP_AND_C2C = 1 << 25;

const RECONNECT_DELAYS = [1, 2, 5, 10, 30, 60];

export class QQChannel extends BaseChannel {
  readonly channelType: ChannelType = "qq";
  readonly channelName = "QQ Bot";

  private config: QQConfig;
  private accessToken = "";
  private tokenExpiresAt = 0;
  private ws: WebSocket | null = null;
  private heartbeatInterval = 41250;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private seq: number | null = null;
  private reconnectAttempts = 0;
  private renderer: MessageRenderer;
  private processedIds: Set<string> = new Set();

  constructor(process: ProcessHandler, config: QQConfig, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
    this.config = config;
    this.renderer = new MessageRenderer({
      supportsMarkdown: config.markdown_enabled,
      supportsCodeFence: config.markdown_enabled,
      useEmoji: true,
    });
  }

  resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
    const groupId = meta?.qq_group_id as string | undefined;
    if (groupId) return `qq:group:${groupId}`;
    return senderId ? `qq:${senderId}` : "qq:unknown";
  }

  private async refreshAccessToken(): Promise<void> {
    if (Date.now() < this.tokenExpiresAt - 60000) return;

    try {
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: this.config.app_id,
          clientSecret: this.config.client_secret,
        }),
      });

      if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);

      const data = (await response.json()) as Record<string, unknown>;
      this.accessToken = data.access_token as string;
      this.tokenExpiresAt = Date.now() + (data.expires_in as number) * 1000;
      logger.debug("QQ Bot access token refreshed");
    } catch (error) {
      logger.error(`QQ Bot token refresh failed: ${error}`);
      throw error;
    }
  }

  private async getWebSocketUrl(): Promise<string> {
    await this.refreshAccessToken();

    const response = await fetch(`${DEFAULT_API_BASE}/gateway`, {
      headers: { Authorization: `QQBot ${this.accessToken}` },
    });

    if (!response.ok) throw new Error(`Get gateway failed: ${response.status}`);

    const data = (await response.json()) as Record<string, unknown>;
    return data.url as string;
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      await this.connectWebSocket();
      this._status = "running";
      this._connectedAt = Date.now();
      logger.info("QQ Bot channel started");
    } catch (error) {
      this._status = "error";
      this._error = error instanceof Error ? error.message : String(error);
      logger.error(`QQ Bot channel start failed: ${this._error}`);
    }
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = await this.getWebSocketUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      logger.debug("QQ Bot WebSocket connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        this.handleWSMessage(data);
      } catch (error) {
        logger.error(`QQ Bot WS message parse error: ${error}`);
      }
    };

    this.ws.onclose = (event) => {
      logger.warn(`QQ Bot WebSocket closed: code=${event.code} reason=${event.reason}`);
      this.stopHeartbeat();
      if (this._status === "running") {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      logger.error(`QQ Bot WebSocket error: ${event}`);
    };

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 15000);
      this.ws!.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      this.ws!.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err}`));
      };
    });
  }

  private handleWSMessage(data: Record<string, unknown>): void {
    const op = data.op as number;

    if (op === OP_HELLO) {
      this.heartbeatInterval = (data.d as Record<string, unknown>).heartbeat_interval as number;
      this.sendIdentify();
      this.startHeartbeat();
    } else if (op === OP_DISPATCH) {
      this.seq = data.s as number;
      const t = data.t as string;
      const d = data.d as Record<string, unknown>;

      if (t === "READY") {
        this.sessionId = d.session_id as string;
        this.reconnectAttempts = 0;
        logger.info("QQ Bot session ready");
      } else if (t === "RESUMED") {
        this.reconnectAttempts = 0;
        logger.info("QQ Bot session resumed");
      } else if (t === "C2C_MESSAGE_CREATE" || t === "GROUP_AT_MESSAGE_CREATE" || t === "DIRECT_MESSAGE_CREATE") {
        this.handleMessageEvent(d, t).catch((err) => {
          logger.error(`QQ Bot handle message error: ${err}`);
        });
      }
    } else if (op === OP_HEARTBEAT_ACK) {
      // heartbeat acknowledged
    } else if (op === OP_RECONNECT) {
      logger.info("QQ Bot server requested reconnect");
      this.ws?.close();
    }
  }

  private sendIdentify(): void {
    if (!this.ws) return;

    const intents =
      INTENT_PUBLIC_GUILD_MESSAGES | INTENT_DIRECT_MESSAGE | INTENT_GROUP_AND_C2C;

    const identify = {
      op: OP_IDENTIFY,
      d: {
        token: `QQBot ${this.accessToken}`,
        intents,
        shard: [0, 1],
      },
    };

    this.ws.send(JSON.stringify(identify));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: this.seq }));
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.max_reconnect_attempts) {
      logger.error(`QQ Bot max reconnect attempts (${this.config.max_reconnect_attempts}) reached`);
      this._status = "error";
      this._error = "Max reconnect attempts reached";
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempts++;
    logger.info(`QQ Bot reconnecting in ${delay}s (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        this._status = "running";
      } catch (error) {
        logger.error(`QQ Bot reconnect failed: ${error}`);
        this.scheduleReconnect();
      }
    }, delay * 1000);
  }

  private async handleMessageEvent(data: Record<string, unknown>, eventType: string): Promise<void> {
    const msgId = data.id as string;
    if (this.processedIds.has(msgId)) return;
    this.processedIds.add(msgId);
    if (this.processedIds.size > 2000) {
      const iter = this.processedIds.values();
      for (let i = 0; i < 1000; i++) {
        iter.next();
        this.processedIds.delete(iter.next().value);
      }
    }

    const author = data.author as Record<string, unknown> | undefined;
    const senderId = (author?.member_openid as string) ?? (author?.user_openid as string) ?? "";
    const content = (data.content as string) ?? "";
    const meta: Record<string, unknown> = {
      qq_msg_id: msgId,
      qq_event_type: eventType,
    };

    const isGroup = eventType === "GROUP_AT_MESSAGE_CREATE";
    if (isGroup) {
      const groupId = (data.group_openid as string) ?? "";
      meta.qq_group_id = groupId;
      meta.isGroup = true;
    }

    const contentParts: MessageContent[] = [];
    if (content.trim()) {
      contentParts.push({ type: "text", text: content.trim() });
    }

    const attachments = data.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments) {
      for (const att of attachments) {
        const contentType = att.content_type as string;
        const url = att.url as string;
        if (contentType?.startsWith("image")) {
          contentParts.push({ type: "image", url: url.startsWith("http") ? url : `https://multimedia.nt.qq.com${url}` });
        } else if (contentType?.startsWith("video")) {
          contentParts.push({ type: "video", url: url.startsWith("http") ? url : `https://multimedia.nt.qq.com${url}` });
        } else if (contentType?.startsWith("audio")) {
          contentParts.push({ type: "audio", url: url.startsWith("http") ? url : `https://multimedia.nt.qq.com${url}` });
        }
      }
    }

    if (contentParts.length === 0) return;

    const message = this.buildMessage({ senderId, content: contentParts, meta });

    if (this._enqueue) {
      this._enqueue(message);
    } else {
      await this.consumeOne(message);
    }
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._status = "stopped";
    logger.info("QQ Bot channel stopped");
  }

  async sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void> {
    const text = this.renderer.renderContent(response.content);
    await this.sendText(response.toHandle, text, meta);
  }

  async sendText(toHandle: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    await this.refreshAccessToken();

    const isGroup = Boolean(meta?.isGroup);
    const msgId = meta?.qq_msg_id as string | undefined;

    if (isGroup) {
      const groupId = meta?.qq_group_id as string;
      if (!groupId) throw new Error("Missing group_openid for group message");
      await this.sendGroupMessage(groupId, text, msgId);
    } else {
      const userId = this.extractUserId(toHandle);
      await this.sendC2CMessage(userId, text, msgId);
    }
  }

  private async sendC2CMessage(openId: string, text: string, msgId?: string): Promise<void> {
    const body: Record<string, unknown> = {
      content: text,
      msg_type: 0,
      msg_id: msgId ?? "",
    };

    const response = await fetch(`${DEFAULT_API_BASE}/v2/users/${openId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QQ C2C message failed: ${response.status} ${errorText}`);
    }
  }

  private async sendGroupMessage(groupOpenId: string, text: string, msgId?: string): Promise<void> {
    const body: Record<string, unknown> = {
      content: text,
      msg_type: 0,
      msg_id: msgId ?? "",
    };

    const response = await fetch(`${DEFAULT_API_BASE}/v2/groups/${groupOpenId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QQ group message failed: ${response.status} ${errorText}`);
    }
  }

  private extractUserId(handle: string): string {
    if (handle.startsWith("qq:group:")) return handle.slice("qq:group:".length);
    if (handle.startsWith("qq:")) return handle.slice("qq:".length);
    return handle;
  }
}

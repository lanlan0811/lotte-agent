import { BaseChannel } from "../base.js";
import type {
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
  MessageContent,
} from "../types.js";
import { MessageRenderer } from "../renderer.js";
import { logger } from "../../utils/logger.js";
import type { ChannelsConfig } from "../../config/schema.js";
import {
  QQ_PROCESSED_IDS_MAX,
  QQ_INVALID_SESSION_OP,
  QQ_QUICK_DISCONNECT_THRESHOLD,
  QQ_MAX_QUICK_DISCONNECT_COUNT,
  QQ_RATE_LIMIT_DELAY,
  QQ_RECONNECT_DELAYS,
  QQ_MEDIA_TYPE_IMAGE,
  QQ_MEDIA_TYPE_FILE,
} from "./constants.js";
import {
  getNextMsgSeq,
  shouldFallbackFromMarkdown,
  isUrlContentError,
  sanitizeQqText,
  aggressiveSanitizeQqText,
} from "./utils.js";

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

interface QuickDisconnectState {
  count: number;
  lastConnectTime: number;
}

export class QQChannel extends BaseChannel {
  readonly channelType: ChannelType = "qq";
  readonly channelName = "QQ Bot";

  private config: QQConfig;
  private accessToken = "";
  private tokenExpiresAt = 0;
  private ws: WebSocket | null = null;
  private heartbeatInterval = 41250;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private seq: number | null = null;
  private reconnectAttempts = 0;
  private renderer: MessageRenderer;
  private processedIds: Set<string> = new Set();
  private sessionId: string | null = null;
  private quickDisconnect: QuickDisconnectState = {
    count: 0,
    lastConnectTime: 0,
  };
  private shouldRefreshToken = false;

  constructor(process: ProcessHandler, config: QQConfig, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
    this.config = config;
    this.renderer = new MessageRenderer({
      supportsMarkdown: config.markdown_enabled,
      supportsCodeFence: config.markdown_enabled,
      useEmoji: true,
    });
  }

  override resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
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
    if (this.shouldRefreshToken) {
      this.tokenExpiresAt = 0;
      this.shouldRefreshToken = false;
    }

    const wsUrl = await this.getWebSocketUrl();
    this.ws = new WebSocket(wsUrl);

    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 15000);

      this.ws!.onopen = () => {
        clearTimeout(timeout);
        logger.debug("QQ Bot WebSocket connected");
        resolve();
      };

      this.ws!.onerror = (event) => {
        clearTimeout(timeout);
        logger.error(`QQ Bot WebSocket error: ${event}`);
        reject(new Error(`WebSocket error: ${event}`));
      };
    });

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

    await connectionPromise;
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
        this.reconnectAttempts = 0;
        this.quickDisconnect.lastConnectTime = Date.now() / 1000;
        this.sessionId = (d?.session_id as string) ?? null;
        logger.info("QQ Bot session ready");
      } else if (t === "RESUMED") {
        this.reconnectAttempts = 0;
        this.quickDisconnect.lastConnectTime = Date.now() / 1000;
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
    } else if (op === QQ_INVALID_SESSION_OP) {
      const canResume = data.d as boolean;
      logger.error(`QQ Bot invalid session can_resume=${canResume}`);
      if (!canResume) {
        this.sessionId = null;
        this.seq = null;
        this.shouldRefreshToken = true;
      }
      this.ws?.close();
    }
  }

  private sendIdentify(): void {
    if (!this.ws) return;

    const intents =
      INTENT_PUBLIC_GUILD_MESSAGES | INTENT_DIRECT_MESSAGE | INTENT_GROUP_AND_C2C;

    const identify: Record<string, unknown> = {
      op: OP_IDENTIFY,
      d: {
        token: `QQBot ${this.accessToken}`,
        intents,
        shard: [0, 1],
      },
    };

    if (this.sessionId) {
      (identify.d as Record<string, unknown>).session_id = this.sessionId;
    }
    if (this.seq !== null) {
      (identify.d as Record<string, unknown>).seq = this.seq;
    }

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

  private computeReconnectDelay(): number {
    const elapsed = this.quickDisconnect.lastConnectTime
      ? Date.now() / 1000 - this.quickDisconnect.lastConnectTime
      : null;

    if (elapsed !== null && elapsed < QQ_QUICK_DISCONNECT_THRESHOLD) {
      this.quickDisconnect.count++;
      if (this.quickDisconnect.count >= QQ_MAX_QUICK_DISCONNECT_COUNT) {
        this.sessionId = null;
        this.seq = null;
        this.shouldRefreshToken = true;
        this.quickDisconnect.count = 0;
        this.reconnectAttempts = Math.min(
          this.reconnectAttempts,
          QQ_RECONNECT_DELAYS.length - 1,
        );
        return QQ_RATE_LIMIT_DELAY;
      }
    } else {
      this.quickDisconnect.count = 0;
    }

    return QQ_RECONNECT_DELAYS[Math.min(this.reconnectAttempts, QQ_RECONNECT_DELAYS.length - 1)]!;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.max_reconnect_attempts) {
      logger.error(`QQ Bot max reconnect attempts (${this.config.max_reconnect_attempts}) reached`);
      this._status = "error";
      this._error = "Max reconnect attempts reached";
      return;
    }

    const delay = this.computeReconnectDelay();
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
    if (this.processedIds.size > QQ_PROCESSED_IDS_MAX) {
      const iter = this.processedIds.values();
      for (let i = 0; i < QQ_PROCESSED_IDS_MAX / 2; i++) {
        iter.next();
        const val = iter.next().value;
        if (val) this.processedIds.delete(val);
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
    const messageType = isGroup ? "group" : "c2c";
    if (isGroup) {
      const groupId = (data.group_openid as string) ?? "";
      meta.qq_group_id = groupId;
      meta.isGroup = true;
    }
    meta.qq_message_type = messageType;

    const contentParts: MessageContent[] = [];
    if (content.trim()) {
      contentParts.push({ type: "text", text: content.trim() });
    }

    const attachments = data.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments) {
      for (const att of attachments) {
        const contentType = att.content_type as string;
        const url = att.url as string;
        const fullUrl = url.startsWith("http") ? url : `https://multimedia.nt.qq.com${url}`;
        if (contentType?.startsWith("image")) {
          contentParts.push({ type: "image", url: fullUrl });
        } else if (contentType?.startsWith("video")) {
          contentParts.push({ type: "video", url: fullUrl });
        } else if (contentType?.startsWith("audio")) {
          contentParts.push({ type: "audio", url: fullUrl });
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
    const messageType = (meta?.qq_message_type as string) ?? (isGroup ? "group" : "c2c");
    const useMarkdown = this.config.markdown_enabled;

    if (isGroup) {
      const groupId = meta?.qq_group_id as string;
      if (!groupId) throw new Error("Missing group_openid for group message");
      await this.sendTextWithFallback(messageType, groupId, text, msgId, useMarkdown);
    } else {
      const userId = this.extractUserId(toHandle);
      await this.sendTextWithFallback(messageType, userId, text, msgId, useMarkdown);
    }
  }

  private async sendTextWithFallback(
    messageType: string,
    openId: string,
    text: string,
    msgId: string | undefined,
    useMarkdown: boolean,
  ): Promise<boolean> {
    try {
      await this.dispatchText(messageType, openId, text, msgId, useMarkdown);
      return true;
    } catch (error) {
      if (!useMarkdown) {
        return this.tryAggressiveUrlFallback(error, messageType, openId, text, msgId);
      }
      if (!shouldFallbackFromMarkdown(error)) {
        logger.error(`QQ send text failed with markdown; skip fallback: ${error}`);
        return false;
      }
      logger.warn("QQ send text failed with markdown validation; fallback to plain text");
    }

    const { text: fallbackText } = sanitizeQqText(text);
    try {
      await this.dispatchText(messageType, openId, fallbackText, msgId, false);
      return true;
    } catch (error2) {
      return this.tryAggressiveUrlFallback(error2, messageType, openId, text, msgId);
    }
  }

  private async tryAggressiveUrlFallback(
    error: unknown,
    messageType: string,
    openId: string,
    originalText: string,
    msgId: string | undefined,
  ): Promise<boolean> {
    if (!isUrlContentError(error)) {
      logger.error(`QQ send text failed: ${error}`);
      return false;
    }
    logger.warn("QQ send text failed due to URL content; trying aggressive URL stripping");
    const { text: aggressiveText } = aggressiveSanitizeQqText(originalText);
    try {
      await this.dispatchText(messageType, openId, aggressiveText, msgId, false);
      return true;
    } catch (error3) {
      logger.error(`QQ send text aggressive fallback failed: ${error3}`);
      return false;
    }
  }

  private async dispatchText(
    messageType: string,
    openId: string,
    content: string,
    msgId: string | undefined,
    useMarkdown: boolean,
  ): Promise<void> {
    const useMsgSeq = messageType === "c2c" || messageType === "group";
    const body: Record<string, unknown> = {};

    if (useMarkdown) {
      body.markdown = { content };
      if (useMsgSeq) body.msg_type = 2;
    } else {
      body.content = content;
      if (useMsgSeq) body.msg_type = 0;
    }

    if (useMsgSeq) {
      body.msg_seq = getNextMsgSeq(msgId ?? messageType);
    }
    if (msgId) {
      body.msg_id = msgId;
    }

    const path = this.resolveSendPath(messageType, openId);
    const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QQ API error: ${response.status} ${errorText}`);
    }
  }

  private resolveSendPath(messageType: string, openId: string): string {
    if (messageType === "c2c") {
      return `/v2/users/${openId}/messages`;
    }
    if (messageType === "group") {
      return `/v2/groups/${openId}/messages`;
    }
    return `/channels/${openId}/messages`;
  }

  async sendImage(
    toHandle: string,
    imageUrl: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.refreshAccessToken();

    const isGroup = Boolean(meta?.isGroup);
    const messageType = (meta?.qq_message_type as string) ?? (isGroup ? "group" : "c2c");
    const msgId = meta?.qq_msg_id as string | undefined;
    const openId = isGroup
      ? (meta?.qq_group_id as string)
      : this.extractUserId(toHandle);

    if (!openId) throw new Error("Missing openId for image send");

    const fileInfo = await this.uploadMedia(openId, QQ_MEDIA_TYPE_IMAGE, imageUrl, messageType);
    if (!fileInfo) {
      logger.warn(`QQ upload image failed, skipping: ${imageUrl}`);
      return;
    }

    await this.sendMediaMessage(openId, fileInfo, msgId, messageType);
  }

  async sendFile(
    toHandle: string,
    fileUrl: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.refreshAccessToken();

    const isGroup = Boolean(meta?.isGroup);
    const messageType = (meta?.qq_message_type as string) ?? (isGroup ? "group" : "c2c");
    const msgId = meta?.qq_msg_id as string | undefined;
    const openId = isGroup
      ? (meta?.qq_group_id as string)
      : this.extractUserId(toHandle);

    if (!openId) throw new Error("Missing openId for file send");

    const fileInfo = await this.uploadMedia(openId, QQ_MEDIA_TYPE_FILE, fileUrl, messageType);
    if (!fileInfo) {
      logger.warn(`QQ upload file failed, skipping: ${fileUrl}`);
      return;
    }

    await this.sendMediaMessage(openId, fileInfo, msgId, messageType);
  }

  private async uploadMedia(
    openId: string,
    mediaType: number,
    url: string,
    messageType: string,
  ): Promise<string | null> {
    const path = this.resolveMediaPath(messageType, openId);
    if (!path) return null;

    try {
      const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_type: mediaType,
          url,
          srv_send_msg: false,
        }),
      });

      if (!response.ok) {
        logger.warn(`QQ upload media failed: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      return (data.file_info as string) ?? null;
    } catch (error) {
      logger.error(`QQ upload media error: ${error}`);
      return null;
    }
  }

  private async sendMediaMessage(
    openId: string,
    fileInfo: string,
    msgId: string | undefined,
    messageType: string,
  ): Promise<void> {
    const path = this.resolveSendPath(messageType, openId);
    const body: Record<string, unknown> = {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_seq: getNextMsgSeq(msgId ?? `${messageType}_media`),
    };
    if (msgId) {
      body.msg_id = msgId;
    }

    const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QQ media message failed: ${response.status} ${errorText}`);
    }
  }

  private resolveMediaPath(messageType: string, openId: string): string | null {
    if (messageType === "c2c") {
      return `/v2/users/${openId}/files`;
    }
    if (messageType === "group") {
      return `/v2/groups/${openId}/files`;
    }
    return null;
  }

  private extractUserId(handle: string): string {
    if (handle.startsWith("qq:group:")) return handle.slice("qq:group:".length);
    if (handle.startsWith("qq:")) return handle.slice("qq:".length);
    return handle;
  }
}

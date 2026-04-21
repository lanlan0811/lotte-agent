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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type FeishuConfig = ChannelsConfig["feishu"];

const FEISHU_PROCESSED_IDS_MAX = 2000;
const WS_INITIAL_RETRY_DELAY = 1000;
const WS_MAX_RETRY_DELAY = 60000;
const WS_BACKOFF_FACTOR = 2;
const MESSAGE_EXPIRY_MS = 5 * 60 * 1000;

export class FeishuChannel extends BaseChannel {
  readonly channelType: ChannelType = "feishu";
  readonly channelName = "Feishu (Lark)";

  private config: FeishuConfig;
  private tenantAccessToken = "";
  private tokenExpiresAt = 0;
  private ws: WebSocket | null = null;
  private retryDelay = WS_INITIAL_RETRY_DELAY;
  private renderer: MessageRenderer;
  private processedIds: Set<string> = new Set();
  private receiveIdMap: Map<string, string> = new Map();
  private receiveIdPath: string | null = null;
  private receiveIdFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(process: ProcessHandler, config: FeishuConfig, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
    this.config = config;
    this.dmPolicy = config.dm_policy;
    this.groupPolicy = config.group_policy;
    this.allowFrom = new Set(config.allow_from);
    this.denyMessage = config.deny_message;
    this.botPrefix = config.bot_prefix;
    this.renderer = new MessageRenderer({
      supportsMarkdown: true,
      supportsCodeFence: true,
      useEmoji: true,
    });
  }

  override resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
    const chatId = meta?.feishu_chat_id as string | undefined;
    if (chatId) return `feishu:chat:${chatId}`;
    return senderId ? `feishu:${senderId}` : "feishu:unknown";
  }

  private getApiBase(): string {
    return this.config.domain === "lark"
      ? "https://open.larksuite.com/open-apis"
      : "https://open.feishu.cn/open-apis";
  }

  private async refreshTenantToken(): Promise<void> {
    if (Date.now() < this.tokenExpiresAt - 60000) return;

    try {
      const response = await fetch(`${this.getApiBase()}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.config.app_id,
          app_secret: this.config.app_secret,
        }),
      });

      if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);

      const data = (await response.json()) as Record<string, unknown>;
      this.tenantAccessToken = data.tenant_access_token as string;
      this.tokenExpiresAt = Date.now() + (data.expire as number) * 1000;
      logger.debug("Feishu tenant access token refreshed");
    } catch (error) {
      logger.error(`Feishu token refresh failed: ${error}`);
      throw error;
    }
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      this.loadReceiveIdMap();
      this.startReceiveIdFlush();
      await this.refreshTenantToken();
      await this.connectWebSocket();
      this._status = "running";
      this._connectedAt = Date.now();
      logger.info("Feishu channel started");
    } catch (error) {
      this._status = "error";
      this._error = error instanceof Error ? error.message : String(error);
      logger.error(`Feishu channel start failed: ${this._error}`);
    }
  }

  private async connectWebSocket(): Promise<void> {
    await this.refreshTenantToken();

    const response = await fetch(`${this.getApiBase()}/callback/ws/endpoint`, {
      headers: { Authorization: `Bearer ${this.tenantAccessToken}` },
    });

    if (!response.ok) throw new Error(`Get WS endpoint failed: ${response.status}`);

    const data = (await response.json()) as Record<string, unknown>;
    const dataInner = data.data as Record<string, unknown> | undefined;
    const endpoint = dataInner?.endpoint as string | undefined;
    if (!endpoint) throw new Error("No WebSocket endpoint in response");

    this.ws = new WebSocket(endpoint);

    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 15000);

      this.ws!.onopen = () => {
        clearTimeout(timeout);
        logger.debug("Feishu WebSocket connected");
        this.retryDelay = WS_INITIAL_RETRY_DELAY;
        resolve();
      };

      this.ws!.onerror = (event) => {
        clearTimeout(timeout);
        logger.error(`Feishu WebSocket error: ${event}`);
        reject(new Error(`WebSocket error: ${event}`));
      };
    });

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        this.handleWSMessage(data);
      } catch (error) {
        logger.error(`Feishu WS message parse error: ${error}`);
      }
    };

    this.ws.onclose = () => {
      logger.warn("Feishu WebSocket closed");
      if (this._status === "running") {
        this.scheduleReconnect();
      }
    };

    await connectionPromise;
  }

  private handleWSMessage(data: Record<string, unknown>): void {
    const schema = data.schema as string;
    if (schema === "2.0" && data.header) {
      const header = data.header as Record<string, unknown>;
      const eventType = header.event_type as string;

      if (eventType === "im.message.receive_v1") {
        const event = data.event as Record<string, unknown>;
        const message = event.message as Record<string, unknown>;
        const sender = event.sender as Record<string, unknown>;
        this.handleMessageEvent(message, sender).catch((err) => {
          logger.error(`Feishu handle message error: ${err}`);
        });
      }
    }
  }

  private async handleMessageEvent(
    message: Record<string, unknown>,
    sender: Record<string, unknown>,
  ): Promise<void> {
    const msgId = message.message_id as string;
    if (this.processedIds.has(msgId)) return;
    this.processedIds.add(msgId);
    if (this.processedIds.size > FEISHU_PROCESSED_IDS_MAX) {
      const iter = this.processedIds.values();
      for (let i = 0; i < FEISHU_PROCESSED_IDS_MAX / 2; i++) {
        iter.next();
        this.processedIds.delete(iter.next().value!);
      }
    }

    const createTime = message.create_time as string | undefined;
    if (createTime) {
      const msgTime = parseInt(createTime, 10);
      if (!isNaN(msgTime) && Date.now() - msgTime > MESSAGE_EXPIRY_MS) {
        logger.debug(`Feishu: skipping expired message ${msgId} (age=${Math.round((Date.now() - msgTime) / 1000)}s)`);
        return;
      }
    }

    const chatId = message.chat_id as string;
    const chatType = message.chat_type as string;
    const msgType = message.message_type as string;
    const content = message.content as string;
    const senderId = (sender.sender_id as Record<string, unknown>)?.open_id as string ?? "";

    const meta: Record<string, unknown> = {
      feishu_chat_id: chatId,
      feishu_msg_id: msgId,
      feishu_chat_type: chatType,
      isGroup: chatType === "group",
    };

    this.receiveIdMap.set(senderId, chatId);

    const contentParts: MessageContent[] = [];

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;

      if (msgType === "text") {
        const text = (parsed.text as string)?.trim();
        if (text) contentParts.push({ type: "text", text });
      } else if (msgType === "image") {
        const imageKey = parsed.image_key as string;
        if (imageKey) {
          contentParts.push({
            type: "image",
            url: `${this.getApiBase()}/im/v1/images/${imageKey}`,
          });
        }
      } else if (msgType === "file") {
        const fileKey = parsed.file_key as string;
        const fileName = parsed.file_name as string;
        contentParts.push({
          type: "file",
          filename: fileName,
          url: `${this.getApiBase()}/im/v1/messages/${msgId}/resources/${fileKey}`,
        });
      } else if (msgType === "post") {
        const postContent = this.extractPostText(parsed);
        if (postContent) contentParts.push({ type: "text", text: postContent });
      } else if (msgType === "audio") {
        contentParts.push({ type: "audio", url: "" });
      }
    } catch {
      if (content?.trim()) {
        contentParts.push({ type: "text", text: content.trim() });
      }
    }

    if (contentParts.length === 0) return;

    const message2 = this.buildMessage({ senderId, content: contentParts, meta });

    if (this._enqueue) {
      this._enqueue(message2);
    } else {
      await this.consumeOne(message2);
    }
  }

  private extractPostText(parsed: Record<string, unknown>): string {
    const content = parsed.content as Array<Array<Record<string, unknown>>> | undefined;
    if (!content) return "";

    const texts: string[] = [];
    for (const line of content) {
      for (const element of line) {
        if (element.tag === "text" && element.text) {
          texts.push(element.text as string);
        } else if (element.tag === "a" && element.text) {
          texts.push(element.text as string);
        }
      }
    }
    return texts.join("");
  }

  private scheduleReconnect(): void {
    logger.info(`Feishu reconnecting in ${this.retryDelay / 1000}s`);
    setTimeout(async () => {
      try {
        await this.connectWebSocket();
      } catch (error) {
        logger.error(`Feishu reconnect failed: ${error}`);
        this.retryDelay = Math.min(this.retryDelay * WS_BACKOFF_FACTOR, WS_MAX_RETRY_DELAY);
        this.scheduleReconnect();
      }
    }, this.retryDelay);
  }

  async stop(): Promise<void> {
    this.flushReceiveIdMap();
    if (this.receiveIdFlushTimer) {
      clearInterval(this.receiveIdFlushTimer);
      this.receiveIdFlushTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._status = "stopped";
    logger.info("Feishu channel stopped");
  }

  async sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void> {
    const text = this.renderer.renderContent(response.content);
    await this.sendText(response.toHandle, text, meta);
  }

  async sendText(toHandle: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    await this.refreshTenantToken();

    const chatId = (meta?.feishu_chat_id as string) ?? this.extractChatId(toHandle);
    if (!chatId) throw new Error("No chat_id for Feishu message");

    const body: Record<string, unknown> = {
      msg_type: "text",
      content: JSON.stringify({ text }),
    };

    const response = await fetch(`${this.getApiBase()}/im/v1/messages?receive_id_type=chat_id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.tenantAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: chatId,
        ...body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Feishu message failed: ${response.status} ${errorText}`);
    }
  }

  private extractChatId(handle: string): string {
    if (handle.startsWith("feishu:chat:")) return handle.slice("feishu:chat:".length);
    return this.receiveIdMap.get(handle) ?? handle;
  }

  setReceiveIdPath(dataDir: string): void {
    this.receiveIdPath = join(dataDir, "feishu_receive_ids.json");
  }

  private loadReceiveIdMap(): void {
    if (!this.receiveIdPath) return;
    if (!existsSync(this.receiveIdPath)) return;

    try {
      const data = readFileSync(this.receiveIdPath, "utf-8");
      const parsed = JSON.parse(data) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) {
        this.receiveIdMap.set(key, value);
      }
      logger.debug(`Feishu: loaded ${this.receiveIdMap.size} receive_id mappings`);
    } catch {
      logger.debug("Feishu: failed to load receive_id mappings");
    }
  }

  private flushReceiveIdMap(): void {
    if (!this.receiveIdPath) return;
    if (this.receiveIdMap.size === 0) return;

    try {
      const dir = join(this.receiveIdPath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: Record<string, string> = {};
      for (const [key, value] of this.receiveIdMap) {
        data[key] = value;
      }
      writeFileSync(this.receiveIdPath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      logger.debug("Feishu: failed to flush receive_id mappings");
    }
  }

  private startReceiveIdFlush(): void {
    this.receiveIdFlushTimer = setInterval(() => {
      this.flushReceiveIdMap();
    }, 60000);
  }
}

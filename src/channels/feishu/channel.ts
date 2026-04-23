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
import type { Database } from "../../db/database.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

type FeishuConfig = ChannelsConfig["feishu"];

const FEISHU_PROCESSED_IDS_MAX = 2000;
const FEISHU_STALE_MSG_THRESHOLD_MS = 20_000;
const WS_INITIAL_RETRY_DELAY = 1000;
const WS_MAX_RETRY_DELAY = 60000;
const WS_BACKOFF_FACTOR = 2;

interface ReceiveIdEntry {
  receiveIdType: string;
  receiveId: string;
  updatedAt: number;
}

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
  private receiveIdStore: Map<string, ReceiveIdEntry> = new Map();
  private clockOffset = 0;
  private dataDir: string | null = null;
  private db: Database | null = null;

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

  setDataDir(dir: string): void {
    this.dataDir = dir;
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

  private async fetchBotInfoAndClockOffset(): Promise<void> {
    try {
      const base = this.getApiBase();
      const response = await fetch(`${base}/bot/v3/info`, {
        headers: {
          Authorization: `Bearer ${this.tenantAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      const dateStr = response.headers.get("date");
      if (dateStr) {
        try {
          const serverMs = new Date(dateStr).getTime();
          this.clockOffset = serverMs - Date.now();
          logger.debug(`Feishu clock offset: ${this.clockOffset}ms`);
        } catch {
          // ignore date parse error
        }
      }

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        if (data.code !== 0) {
          logger.debug(`Feishu bot info returned code=${data.code}`);
        }
      }
    } catch (error) {
      logger.debug(`Feishu fetch bot info failed: ${error}`);
    }
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      await this.refreshTenantToken();
      await this.fetchBotInfoAndClockOffset();
      this.loadReceiveIdStoreFromDisk();
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

      if (this.isStaleMessage(header)) {
        return;
      }

      if (eventType === "im.message.receive_v1") {
        const event = data.event as Record<string, unknown>;
        const message = event.message as Record<string, unknown>;
        const sender = event.sender as Record<string, unknown>;
        this.handleMessageEvent(message, sender, header).catch((err) => {
          logger.error(`Feishu handle message error: ${err}`);
        });
      }
    }
  }

  private isStaleMessage(header: Record<string, unknown>): boolean {
    const createTime = header.create_time as string | number | undefined;
    if (!createTime) return false;

    const createMs = typeof createTime === "number" ? createTime : parseInt(createTime, 10);
    if (isNaN(createMs)) return false;

    const nowMs = Date.now() + this.clockOffset;
    const ageMs = nowMs - createMs;

    if (ageMs > FEISHU_STALE_MSG_THRESHOLD_MS) {
      logger.debug(`Feishu: drop stale message age=${(ageMs / 1000).toFixed(1)}s (retry)`);
      return true;
    }

    return false;
  }

  private async handleMessageEvent(
    message: Record<string, unknown>,
    sender: Record<string, unknown>,
    header: Record<string, unknown>,
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

    const chatId = message.chat_id as string;
    const chatType = message.chat_type as string;
    const msgType = message.message_type as string;
    const content = message.content as string;
    const senderId = (sender.sender_id as Record<string, unknown>)?.open_id as string ?? "";

    const meta: Record<string, unknown> = {
      feishu_chat_id: chatId,
      feishu_msg_id: msgId,
      feishu_chat_type: chatType,
      feishu_sender_id: senderId,
      isGroup: chatType === "group",
    };

    if (header.create_time) {
      meta.feishu_create_time = header.create_time;
    }

    this.receiveIdMap.set(senderId, chatId);

    const sessionId = this.resolveSessionId(senderId, meta);
    this.saveReceiveId(sessionId, "chat_id", chatId);
    if (senderId) {
      this.saveReceiveId(`feishu:${senderId}`, "open_id", senderId);
    }

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

    const route = this.routeFromHandle(toHandle);
    let receiveIdType = route.receiveIdType;
    let receiveId = route.receiveId;

    if (!receiveId && route.sessionKey) {
      const loaded = this.loadReceiveId(route.sessionKey);
      if (loaded) {
        receiveIdType = loaded.receiveIdType;
        receiveId = loaded.receiveId;
      }
    }

    if (!receiveId) {
      const chatId = (meta?.feishu_chat_id as string) ?? this.extractChatId(toHandle);
      if (chatId) {
        receiveId = chatId;
        receiveIdType = "chat_id";
      }
    }

    if (!receiveId) throw new Error("No receive_id for Feishu message");

    const body: Record<string, unknown> = {
      msg_type: "text",
      content: JSON.stringify({ text }),
    };

    const response = await fetch(
      `${this.getApiBase()}/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tenantAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: receiveId,
          ...body,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Feishu message failed: ${response.status} ${errorText}`);
    }
  }

  private routeFromHandle(toHandle: string): { receiveIdType?: string; receiveId?: string; sessionKey?: string } {
    const s = toHandle.trim();
    if (s.startsWith("feishu:chat:")) {
      return { receiveIdType: "chat_id", receiveId: s.slice("feishu:chat:".length) };
    }
    if (s.startsWith("feishu:open_id:")) {
      return { receiveIdType: "open_id", receiveId: s.slice("feishu:open_id:".length) };
    }
    if (s.startsWith("oc_")) {
      return { receiveIdType: "chat_id", receiveId: s };
    }
    if (s.startsWith("ou_")) {
      return { receiveIdType: "open_id", receiveId: s };
    }
    return { sessionKey: s };
  }

  private extractChatId(handle: string): string {
    if (handle.startsWith("feishu:chat:")) return handle.slice("feishu:chat:".length);
    return this.receiveIdMap.get(handle) ?? handle;
  }

  private saveReceiveId(sessionId: string, receiveIdType: string, receiveId: string): void {
    if (!sessionId || !receiveId) return;
    this.receiveIdStore.set(sessionId, {
      receiveIdType,
      receiveId,
      updatedAt: Date.now(),
    });
    this.saveReceiveIdStoreToDisk();
  }

  private loadReceiveId(sessionId: string): ReceiveIdEntry | undefined {
    const cached = this.receiveIdStore.get(sessionId);
    if (cached) return cached;
    this.loadReceiveIdStoreFromDisk();
    return this.receiveIdStore.get(sessionId);
  }

  getReceiveId(sessionId: string): { receiveIdType: string; receiveId: string } | undefined {
    const entry = this.loadReceiveId(sessionId);
    if (!entry) return undefined;
    return { receiveIdType: entry.receiveIdType, receiveId: entry.receiveId };
  }

  private getReceiveIdStorePath(): string | null {
    if (!this.dataDir) return null;
    return join(this.dataDir, "feishu_receive_ids.json");
  }

  private loadReceiveIdStoreFromDisk(): void {
    const storePath = this.getReceiveIdStorePath();
    if (!storePath) return;

    try {
      if (!existsSync(storePath)) return;
      const raw = readFileSync(storePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (typeof data === "object" && data !== null) {
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value) && value.length >= 2) {
            const [a, b] = value as [string, string];
            if (b === "open_id" || b === "chat_id") {
              this.receiveIdStore.set(key, { receiveIdType: b, receiveId: a, updatedAt: Date.now() });
            } else {
              this.receiveIdStore.set(key, { receiveIdType: a, receiveId: b, updatedAt: Date.now() });
            }
          }
        }
      }
      logger.debug(`Feishu loaded ${this.receiveIdStore.size} receive_id entries from disk`);
    } catch (error) {
      logger.debug(`Feishu load receive_id store failed: ${error}`);
    }
  }

  private saveReceiveIdStoreToDisk(): void {
    const storePath = this.getReceiveIdStorePath();
    if (!storePath) return;

    try {
      mkdirSync(dirname(storePath), { recursive: true });
      const data: Record<string, [string, string]> = {};
      for (const [key, entry] of this.receiveIdStore.entries()) {
        data[key] = [entry.receiveIdType, entry.receiveId];
      }
      writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      logger.debug(`Feishu save receive_id store failed: ${error}`);
    }
  }
}

import { BaseChannel } from "../base.js";
import type {
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
  MessageContent,
} from "../types.js";
import { ILinkClient } from "./client.js";
import { MessageRenderer } from "../renderer.js";
import { logger } from "../../utils/logger.js";
import type { ChannelsConfig } from "../../config/schema.js";

type WeixinConfig = ChannelsConfig["weixin"];

const PROCESSED_IDS_MAX = 2000;

export class WeixinChannel extends BaseChannel {
  readonly channelType: ChannelType = "weixin";
  readonly channelName = "WeChat (iLink Bot)";

  private config: WeixinConfig;
  private client: ILinkClient | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private cursor = "";
  private processedIds: Set<string> = new Set();
  private userContextTokens: Map<string, string> = new Map();
  private renderer: MessageRenderer;

  constructor(process: ProcessHandler, config: WeixinConfig, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
    this.config = config;
    this.dmPolicy = config.dm_policy;
    this.groupPolicy = config.group_policy;
    this.allowFrom = new Set(config.allow_from);
    this.denyMessage = config.deny_message;
    this.botPrefix = config.bot_prefix;
    this.renderer = new MessageRenderer({
      supportsMarkdown: false,
      supportsCodeFence: false,
      useEmoji: true,
    });
  }

  override resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
    const groupId = (meta?.weixin_group_id as string)?.trim();
    if (groupId) return `weixin:group:${groupId}`;
    return senderId ? `weixin:${senderId}` : "weixin:unknown";
  }

  private isDuplicate(msgId: string): boolean {
    if (this.processedIds.has(msgId)) return true;
    this.processedIds.add(msgId);
    if (this.processedIds.size > PROCESSED_IDS_MAX) {
      const iter = this.processedIds.values();
      for (let i = 0; i < PROCESSED_IDS_MAX / 2; i++) {
        iter.next();
        this.processedIds.delete(iter.next().value!);
      }
    }
    return false;
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      let token = this.config.bot_token;

      if (!token && this.config.bot_token_file) {
        try {
          const fs = await import("node:fs/promises");
          token = (await fs.readFile(this.config.bot_token_file, "utf-8")).trim();
        } catch {
          // file not found, will try QR login
        }
      }

      this.client = new ILinkClient({
        botToken: token,
        baseUrl: this.config.base_url || undefined,
      });

      if (!token) {
        logger.info("WeChat: No bot_token, starting QR code login...");
        const qrData = await this.client.getBotQrcode();
        const qrcode = qrData.qrcode as string;
        const qrcodeUrl = qrData.url as string;
        logger.info(`WeChat: Please scan QR code to login. URL: ${qrcodeUrl}`);
        const result = await this.client.waitForLogin(qrcode);
        this.client.botToken = result.token;
        this.client.baseUrl = result.baseUrl;
        if (this.config.bot_token_file) {
          try {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            await fs.mkdir(path.dirname(this.config.bot_token_file), { recursive: true });
            await fs.writeFile(this.config.bot_token_file, result.token, "utf-8");
          } catch (err) {
            logger.warn(`WeChat: Failed to save token: ${err}`);
          }
        }
      }

      this._status = "running";
      this._connectedAt = Date.now();
      this.startPolling();
      logger.info("WeChat channel started");
    } catch (error) {
      this._status = "error";
      this._error = error instanceof Error ? error.message : String(error);
      logger.error(`WeChat channel start failed: ${this._error}`);
    }
  }

  private startPolling(): void {
    const poll = async () => {
      if (this._status !== "running" || !this.client) return;

      try {
        const data = await this.client.getupdates(this.cursor);
        const ret = data.ret as number;
        const newCursor = data.get_updates_buf as string | undefined;
        if (newCursor != null) this.cursor = newCursor;

        const msgs = (data.msgs as Array<Record<string, unknown>>) ?? [];
        for (const msg of msgs) {
          await this.handleInboundMessage(msg);
        }

        if (ret !== 0 && ret !== -1 && msgs.length === 0) {
          logger.warn(`WeChat getupdates ret=${ret}, retrying in 3s`);
          this.pollTimer = setTimeout(poll, 3000);
          return;
        }
      } catch (error) {
        if (this._status === "running") {
          logger.error(`WeChat poll error: ${error}, retrying in 5s`);
          this.pollTimer = setTimeout(poll, 5000);
          return;
        }
      }

      if (this._status === "running") {
        this.pollTimer = setTimeout(poll, 100);
      }
    };

    this.pollTimer = setTimeout(poll, 1000);
  }

  private async handleInboundMessage(msg: Record<string, unknown>): Promise<void> {
    try {
      const fromUserId = (msg.from_user_id as string) ?? "";
      const contextToken = (msg.context_token as string) ?? "";
      const groupId = (msg.group_id as string) ?? "";
      const msgType = (msg.message_type as number) ?? 0;

      if (msgType !== 1) return;

      const dedupKey = contextToken || `${fromUserId}_${msg.msg_id ?? ""}`;
      if (dedupKey && this.isDuplicate(dedupKey)) return;

      if (contextToken) {
        this.userContextTokens.set(fromUserId, contextToken);
      }

      const contentParts: MessageContent[] = [];
      const itemList = (msg.item_list as Array<Record<string, unknown>>) ?? [];

      for (const item of itemList) {
        const itemType = item.type as number;
        if (itemType === 1) {
          const textItem = item.text_item as Record<string, unknown> | undefined;
          const text = (textItem?.text as string)?.trim();
          if (text) contentParts.push({ type: "text", text });
        } else if (itemType === 2) {
          const imageItem = item.image_item as Record<string, unknown> | undefined;
          if (imageItem) {
            contentParts.push({
              type: "image",
              url: (imageItem.url as string) ?? "",
              aesKeyB64: imageItem.aes_key as string | undefined,
              encryptQueryParam: imageItem.encrypt_query_param as string | undefined,
            } as unknown as MessageContent);
          }
        } else if (itemType === 3) {
          const videoItem = item.video_item as Record<string, unknown> | undefined;
          if (videoItem) {
            contentParts.push({
              type: "video",
              url: (videoItem.url as string) ?? "",
            });
          }
        } else if (itemType === 4) {
          const fileItem = item.file_item as Record<string, unknown> | undefined;
          if (fileItem) {
            contentParts.push({
              type: "file",
              filename: (fileItem.file_name as string) ?? "",
              url: (fileItem.url as string) ?? "",
            });
          }
        }
      }

      if (contentParts.length === 0) return;

      const meta: Record<string, unknown> = {};
      if (groupId) meta.weixin_group_id = groupId;
      if (contextToken) meta.context_token = contextToken;
      meta.isGroup = !!groupId;

      const message = this.buildMessage({
        senderId: fromUserId,
        content: contentParts,
        meta,
      });

      if (this._enqueue) {
        this._enqueue(message);
      } else {
        await this.consumeOne(message);
      }
    } catch (error) {
      logger.error(`WeChat handleInboundMessage error: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.client?.abort();
    this.client = null;
    this._status = "stopped";
    logger.info("WeChat channel stopped");
  }

  async sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void> {
    const text = this.renderer.renderContent(response.content);
    await this.sendText(response.toHandle, text, meta);
  }

  async sendText(toHandle: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error("WeChat client not initialized");

    const userId = this.extractUserId(toHandle);
    const contextToken = (meta?.context_token as string) ?? this.userContextTokens.get(userId) ?? "";

    const chunks = this.splitText(text, 2000);
    for (const chunk of chunks) {
      await this.client.sendText(userId, chunk, contextToken);
    }
  }

  private extractUserId(handle: string): string {
    if (handle.startsWith("weixin:group:")) return handle.slice("weixin:group:".length);
    if (handle.startsWith("weixin:")) return handle.slice("weixin:".length);
    return handle;
  }
}

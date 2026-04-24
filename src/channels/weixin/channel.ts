import { BaseChannel } from "../base.js";
import type {
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
  MessageContent,
} from "../types.js";
import { ILinkClient, type CdnUploadResult } from "./client.js";
import { MessageRenderer } from "../renderer.js";
import { logger } from "../../utils/logger.js";
import { formatErrorMessage } from "../../errors/errors.js";
import type { ChannelsConfig } from "../../config/schema.js";
import { WEIXIN_PROCESSED_IDS_MAX, WEIXIN_TYPING_STATUS_START, WEIXIN_TYPING_STATUS_STOP } from "./constants.js";
import { ensureMediaDir, safeFilename } from "./utils.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

type WeixinConfig = ChannelsConfig["weixin"];

interface TypingTicketCache {
  ticket: string;
  expiry: number;
}

const TYPING_TICKET_TTL = 24 * 3600 * 1000;
const TYPING_REFRESH_INTERVAL = 5000;
const FILENAME_EXTENSIONS = [
  ".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".gif",
  ".mp4", ".avi", ".mov", ".mp3", ".wav", ".zip", ".rar",
  ".xlsx", ".xls", ".ppt", ".pptx",
];

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
  private mediaDir: string;
  private typingTicketCache: Map<string, TypingTicketCache> = new Map();
  private typingStopFuncs: Map<string, () => void> = new Map();
  private typingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

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
    this.mediaDir = ensureMediaDir();
  }

  override resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
    const groupId = (meta?.weixin_group_id as string)?.trim();
    if (groupId) return `weixin:group:${groupId}`;
    return senderId ? `weixin:${senderId}` : "weixin:unknown";
  }

  private isDuplicate(msgId: string): boolean {
    if (this.processedIds.has(msgId)) return true;
    this.processedIds.add(msgId);
    if (this.processedIds.size > WEIXIN_PROCESSED_IDS_MAX) {
      const iter = this.processedIds.values();
      for (let i = 0; i < WEIXIN_PROCESSED_IDS_MAX / 2; i++) {
        iter.next();
        const val = iter.next().value;
        if (val) this.processedIds.delete(val);
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
      this._error = formatErrorMessage(error);
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
      const textParts: string[] = [];
      const itemList = (msg.item_list as Array<Record<string, unknown>>) ?? [];

      for (const item of itemList) {
        const itemType = item.type as number;
        if (itemType === 1) {
          const textItem = item.text_item as Record<string, unknown> | undefined;
          const text = (textItem?.text as string)?.trim();
          if (text) {
            const isFilename = FILENAME_EXTENSIONS.some((ext) =>
              text.toLowerCase().endsWith(ext),
            );
            if (!isFilename) {
              textParts.push(text);
            }
          }
        } else if (itemType === 2) {
          await this.handleImageItem(item, contentParts, textParts);
        } else if (itemType === 3) {
          if (this.config.voice_asr) {
            this.handleVoiceItem(item, textParts);
          }
        } else if (itemType === 4) {
          await this.handleFileItem(item, contentParts, textParts);
        } else if (itemType === 5) {
          await this.handleVideoItem(item, contentParts, textParts);
        } else {
          textParts.push(`[unsupported type: ${itemType}]`);
        }
      }

      const text = textParts.join("\n").trim();
      if (text) {
        contentParts.unshift({ type: "text", text });
      }
      if (contentParts.length === 0) return;

      const meta: Record<string, unknown> = {};
      if (groupId) meta.weixin_group_id = groupId;
      if (contextToken) meta.context_token = contextToken;
      meta.isGroup = !!groupId;
      meta.weixin_from_user_id = fromUserId;

      if (fromUserId && contextToken && this.config.typing_indicator) {
        this.startTyping(fromUserId, contextToken).catch((err) => {
          logger.warn(`WeChat start_typing failed: ${err}`);
        });
      }

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

  private async handleImageItem(
    item: Record<string, unknown>,
    contentParts: MessageContent[],
    textParts: string[],
  ): Promise<void> {
    if (!this.client) return;
    const imgItem = (item.image_item as Record<string, unknown>) ?? {};
    const media = (imgItem.media as Record<string, unknown>) ?? {};
    const encryptQueryParam = (media.encrypt_query_param as string) ?? "";
    const aeskeyHex = (imgItem.aeskey as string) ?? "";
    let aesKey = "";
    if (aeskeyHex) {
      aesKey = Buffer.from(aeskeyHex, "hex").toString("base64");
    } else {
      aesKey = (media.aes_key as string) ?? "";
    }
    if (encryptQueryParam) {
      const path = await this.downloadMedia("", aesKey, "image.jpg", encryptQueryParam);
      if (path) {
        contentParts.push({ type: "image", url: path } as unknown as MessageContent);
      } else {
        textParts.push("[image: download failed]");
      }
    } else {
      textParts.push("[image: no url]");
    }
  }

  private handleVoiceItem(
    item: Record<string, unknown>,
    textParts: string[],
  ): void {
    const voiceItem = (item.voice_item as Record<string, unknown>) ?? {};
    const textItem = voiceItem.text_item as Record<string, unknown> | undefined;
    const asrText = textItem
      ? ((textItem.text as string) ?? "").trim()
      : ((voiceItem.text as string) ?? "").trim();
    if (asrText) {
      textParts.push(asrText);
    } else {
      textParts.push("[voice: no transcription]");
    }
  }

  private async handleFileItem(
    item: Record<string, unknown>,
    contentParts: MessageContent[],
    textParts: string[],
  ): Promise<void> {
    if (!this.client) return;
    const fileItem = (item.file_item as Record<string, unknown>) ?? {};
    const filename = (fileItem.file_name as string) ?? "file.bin";
    const media = (fileItem.media as Record<string, unknown>) ?? {};
    const encryptQueryParam = (media.encrypt_query_param as string) ?? "";
    const aesKey = (media.aes_key as string) ?? "";
    if (encryptQueryParam) {
      const path = await this.downloadMedia("", aesKey, filename, encryptQueryParam);
      if (path) {
        contentParts.push({ type: "file", filename, url: path } as unknown as MessageContent);
      } else {
        textParts.push("[file: download failed]");
      }
    } else {
      textParts.push("[file: no url]");
    }
  }

  private async handleVideoItem(
    item: Record<string, unknown>,
    contentParts: MessageContent[],
    textParts: string[],
  ): Promise<void> {
    if (!this.client) return;
    const videoItem = (item.video_item as Record<string, unknown>) ?? {};
    const media = (videoItem.media as Record<string, unknown>) ?? {};
    const encryptQueryParam = (media.encrypt_query_param as string) ?? "";
    const aesKey = (media.aes_key as string) ?? "";
    if (encryptQueryParam) {
      const path = await this.downloadMedia("", aesKey, "video.mp4", encryptQueryParam);
      if (path) {
        contentParts.push({ type: "video", url: path } as unknown as MessageContent);
      } else {
        textParts.push("[video: download failed]");
      }
    } else {
      textParts.push("[video: no url]");
    }
  }

  private async downloadMedia(
    url: string,
    aesKey: string,
    filenameHint: string,
    encryptQueryParam: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const data = await this.client.downloadCdnMedia(url, aesKey, encryptQueryParam);
      const safeName = safeFilename(filenameHint) || "media";
      const urlHash = createHash("md5")
        .update(encryptQueryParam || url)
        .digest("hex")
        .slice(0, 8);
      const filePath = join(this.mediaDir, `weixin_${urlHash}_${safeName}`);
      await writeFile(filePath, data);
      return filePath;
    } catch (error) {
      logger.error(`WeChat downloadMedia failed: ${error}`);
      return null;
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopAllTyping();
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

    this.stopTypingForUser(userId);

    const chunks = this.splitText(text, 2000);
    for (const chunk of chunks) {
      await this.client.sendText(userId, chunk, contextToken);
    }
  }

  async sendImage(toHandle: string, imagePath: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error("WeChat client not initialized");
    const userId = this.extractUserId(toHandle);
    const contextToken = (meta?.context_token as string) ?? this.userContextTokens.get(userId) ?? "";
    if (!contextToken) {
      logger.warn("WeChat sendImage: no context_token");
      return;
    }

    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");
    const fileData = await readFile(imagePath);
    const fileName = basename(imagePath);

    const uploadResult = await this.uploadAndSendMedia(
      userId, contextToken, fileData, fileName, "image",
    );
    if (uploadResult) {
      await this.client.sendImageMessage(userId, contextToken, uploadResult);
    }
  }

  async sendFile(toHandle: string, filePath: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error("WeChat client not initialized");
    const userId = this.extractUserId(toHandle);
    const contextToken = (meta?.context_token as string) ?? this.userContextTokens.get(userId) ?? "";
    if (!contextToken) {
      logger.warn("WeChat sendFile: no context_token");
      return;
    }

    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");
    const fileData = await readFile(filePath);
    const fileName = basename(filePath);

    const uploadResult = await this.uploadAndSendMedia(
      userId, contextToken, fileData, fileName, "file",
    );
    if (uploadResult) {
      await this.client.sendFileMessage(userId, contextToken, uploadResult, fileName);
    }
  }

  private async uploadAndSendMedia(
    _userId: string,
    _contextToken: string,
    fileData: Buffer,
    _fileName: string,
    _mediaType: "image" | "file" | "video",
  ): Promise<CdnUploadResult | null> {
    if (!this.client) return null;
    try {
      const { aesKeyHex, aesKeyB64ForEncrypt } =
        await this.client.prepareCdnUpload();

      const { aesEcbEncrypt } = await import("./utils.js");
      const encryptedData = aesEcbEncrypt(fileData, aesKeyB64ForEncrypt);

      const uploadResult = await this.client.uploadCdnMedia(
        fileData,
        aesKeyHex,
        encryptedData.length,
        "",
      );

      if (!uploadResult.encryptQueryParam) {
        logger.error("WeChat uploadAndSendMedia: CDN did not return encrypt_query_param");
        return null;
      }

      return uploadResult;
    } catch (error) {
      logger.error(`WeChat uploadAndSendMedia failed: ${error}`);
      return null;
    }
  }

  private async getTypingTicket(userId: string, contextToken: string): Promise<string> {
    const now = Date.now();
    const cached = this.typingTicketCache.get(userId);
    if (cached && now < cached.expiry) {
      return cached.ticket;
    }

    if (!this.client) return "";

    try {
      const resp = await this.client.getconfig(userId, contextToken);
      const ret = resp.ret as number;
      const errcode = (resp.errcode as number) ?? 0;
      if (ret === 0 && errcode === 0) {
        const ticket = ((resp.typing_ticket as string) ?? "").trim();
        if (ticket) {
          this.typingTicketCache.set(userId, {
            ticket,
            expiry: now + TYPING_TICKET_TTL,
          });
          return ticket;
        }
      }
    } catch (error) {
      logger.warn(`WeChat getconfig failed: ${error}`);
    }
    return "";
  }

  async startTyping(userId: string, contextToken: string): Promise<void> {
    const ticket = await this.getTypingTicket(userId, contextToken);
    if (!ticket || !this.client) return;

    this.stopTypingForUser(userId);

    try {
      await this.client.sendtyping(userId, ticket, WEIXIN_TYPING_STATUS_START);
    } catch (error) {
      logger.warn(`WeChat sendtyping initial failed: ${error}`);
    }

    const timer = setInterval(async () => {
      if (!this.client) {
        this.stopTypingForUser(userId);
        return;
      }
      try {
        await this.client.sendtyping(userId, ticket, WEIXIN_TYPING_STATUS_START);
      } catch (error) {
        logger.warn(`WeChat sendtyping refresh failed: ${error}`);
        this.stopTypingForUser(userId);
      }
    }, TYPING_REFRESH_INTERVAL);

    this.typingTimers.set(userId, timer);
    this.typingStopFuncs.set(userId, () => {
      clearInterval(timer);
      this.typingTimers.delete(userId);
      this.typingStopFuncs.delete(userId);
      if (this.client) {
        this.client.sendtyping(userId, ticket, WEIXIN_TYPING_STATUS_STOP).catch(() => {});
      }
    });
  }

  private stopTypingForUser(userId: string): void {
    const stopFunc = this.typingStopFuncs.get(userId);
    if (stopFunc) {
      stopFunc();
    }
  }

  private stopAllTyping(): void {
    for (const [userId] of this.typingStopFuncs) {
      this.stopTypingForUser(userId);
    }
  }

  private extractUserId(handle: string): string {
    if (handle.startsWith("weixin:group:")) return handle.slice("weixin:group:".length);
    if (handle.startsWith("weixin:")) return handle.slice("weixin:".length);
    return handle;
  }
}

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
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  Client,
  WSClient,
  EventDispatcher,
  Domain,
  type EventHandles,
} from "@larksuiteoapi/node-sdk";
import {
  FEISHU_PROCESSED_IDS_MAX,
  FEISHU_STALE_MSG_THRESHOLD_MS,
  FEISHU_NICKNAME_CACHE_MAX,
  FEISHU_REACTION_TYPING,
  FEISHU_REACTION_DONE,
  FEISHU_FILE_MAX_BYTES,
} from "./constants.js";
import {
  shortSessionIdFromFullId,
  senderDisplayString,
  extractJsonKey,
  extractPostText,
  extractPostImageKeys,
  extractPostMediaFileKeys,
  detectFileExt,
  normalizeFeishuMd,
  buildInteractiveContentChunks,
  safeFilename,
  ensureMediaDir,
  getDefaultMediaDir,
} from "./utils.js";

type FeishuConfig = ChannelsConfig["feishu"];

interface ReceiveIdEntry {
  receiveIdType: string;
  receiveId: string;
  updatedAt: number;
}

export class FeishuChannel extends BaseChannel {
  readonly channelType: ChannelType = "feishu";
  readonly channelName = "Feishu (Lark)";

  private config: FeishuConfig;
  private client: Client | null = null;
  private wsClient: WSClient | null = null;
  private renderer: MessageRenderer;
  private processedIds: Set<string> = new Set();
  private receiveIdMap: Map<string, string> = new Map();
  private receiveIdStore: Map<string, ReceiveIdEntry> = new Map();
  private clockOffset = 0;
  private dataDir: string | null = null;
  private db: Database | null = null;
  private mediaDir: string;
  private botOpenId: string | null = null;
  private nicknameCache: Map<string, string> = new Map();

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
    if (config.media_dir) {
      this.mediaDir = ensureMediaDir(config.media_dir);
    } else {
      this.mediaDir = ensureMediaDir(getDefaultMediaDir());
    }
  }

  setDataDir(dir: string): void {
    this.dataDir = dir;
  }

  setDatabase(db: Database): void {
    this.db = db;
  }

  override resolveSessionId(senderId: string, meta?: Record<string, unknown>): string {
    const chatId = meta?.feishu_chat_id as string | undefined;
    const chatType = meta?.feishu_chat_type as string | undefined;
    if (chatType === "group" && chatId) {
      const appSuffix =
        this.config.app_id.length >= 4 ? this.config.app_id.slice(-4) : this.config.app_id;
      return `${appSuffix}_${shortSessionIdFromFullId(chatId)}`;
    }
    if (senderId) return shortSessionIdFromFullId(senderId);
    if (chatId) return shortSessionIdFromFullId(chatId);
    return `feishu:${senderId}`;
  }

  private getSdkDomain(): Domain | string {
    return this.config.domain === "lark" ? Domain.Lark : Domain.Feishu;
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      if (!this.config.app_id || !this.config.app_secret) {
        throw new Error("Feishu app_id and app_secret are required");
      }

      this.client = new Client({
        appId: this.config.app_id,
        appSecret: this.config.app_secret,
        domain: this.getSdkDomain(),
      });

      this.loadReceiveIdStoreFromDisk();

      const eventDispatcher = new EventDispatcher({
        encryptKey: this.config.encrypt_key || undefined,
        verificationToken: this.config.verification_token || undefined,
      }).register({
        "im.message.receive_v1": async (data) => {
          this.handleSdkMessage(data).catch((err) => {
            logger.error(`Feishu handle message error: ${err}`);
          });
        },
      } as EventHandles & Record<string, unknown>);

      this.wsClient = new WSClient({
        appId: this.config.app_id,
        appSecret: this.config.app_secret,
        domain: this.getSdkDomain(),
      });

      await this.wsClient.start({ eventDispatcher });

      this.botOpenId = await this.fetchBotOpenId();

      this._status = "running";
      this._connectedAt = Date.now();
      logger.info(
        `Feishu channel started (app_id=${this.config.app_id.slice(0, 12)}, bot_open_id=${this.botOpenId?.slice(0, 12) ?? "?"})`,
      );
    } catch (error) {
      this._status = "error";
      this._error = error instanceof Error ? error.message : String(error);
      logger.error(`Feishu channel start failed: ${this._error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close({ force: true });
      this.wsClient = null;
    }
    this.client = null;
    this._status = "stopped";
    logger.info("Feishu channel stopped");
  }

  private async fetchBotOpenId(): Promise<string | null> {
    if (!this.client) return null;
    try {
      const base =
        this.config.domain === "lark"
          ? "https://open.larksuite.com/open-apis"
          : "https://open.feishu.cn/open-apis";
      const token = await this.getTenantAccessToken();
      const response = await fetch(`${base}/bot/v3/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
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
          // ignore
        }
      }
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        if (data.code === 0) {
          const bot = data.bot as Record<string, unknown> | undefined;
          return (bot?.open_id as string) ?? null;
        }
      }
    } catch (error) {
      logger.debug(`Feishu fetch bot info failed: ${error}`);
    }
    return null;
  }

  private async getTenantAccessToken(): Promise<string> {
    if (!this.client) throw new Error("Feishu client not initialized");
    const config = (this.client as unknown as { tokenManager: { get: () => Promise<string> } })
      .tokenManager;
    return config.get();
  }

  private async handleSdkMessage(data: Record<string, unknown>): Promise<void> {
    const header = data.header as Record<string, unknown> | undefined;
    const event = data.event as Record<string, unknown> | undefined;
    if (!header || !event) return;

    const eventAppId = header.app_id as string | undefined;
    if (eventAppId && eventAppId !== this.config.app_id) {
      logger.debug(
        `Feishu: drop misrouted event app_id=${eventAppId} (expected ${this.config.app_id})`,
      );
      return;
    }

    if (this.isStaleMessage(header)) return;

    const message = event.message as Record<string, unknown> | undefined;
    const sender = event.sender as Record<string, unknown> | undefined;
    if (!message || !sender) return;

    const msgId = message.message_id as string;
    if (this.processedIds.has(msgId)) return;
    this.processedIds.add(msgId);
    if (this.processedIds.size > FEISHU_PROCESSED_IDS_MAX) {
      const iter = this.processedIds.values();
      for (let i = 0; i < FEISHU_PROCESSED_IDS_MAX / 2; i++) {
        const r = iter.next();
        if (!r.done) this.processedIds.delete(r.value);
      }
    }

    const senderType = (sender.sender_type as string) ?? "";
    if (senderType === "bot") return;

    const senderIdObj = sender.sender_id as Record<string, unknown> | undefined;
    const senderId = (senderIdObj?.open_id as string) ?? "";
    if (!senderId) return;

    const chatId = (message.chat_id as string) ?? "";
    const chatType = (message.chat_type as string) ?? "p2p";
    const msgType = (message.message_type as string) ?? "text";
    const contentRaw = (message.content as string) ?? "";

    const mentions = (message.mentions as Array<Record<string, unknown>>) ?? [];
    let isBotMentioned = false;
    const botMentionKeys: string[] = [];
    if (contentRaw.includes("@_all")) isBotMentioned = true;
    if (this.botOpenId) {
      for (const m of mentions) {
        const mId = m.id as Record<string, unknown> | undefined;
        const mOpenId = (mId?.open_id as string) ?? "";
        if (mOpenId === this.botOpenId) {
          isBotMentioned = true;
          const key = (m.key as string) ?? "";
          if (key) botMentionKeys.push(key);
        }
      }
    }

    const nickname = await this.getUserNameByOpenId(senderId);
    const senderDisplay = senderDisplayString(nickname, senderId);

    const meta: Record<string, unknown> = {
      feishu_chat_id: chatId,
      feishu_msg_id: msgId,
      feishu_chat_type: chatType,
      feishu_sender_id: senderId,
      isGroup: chatType === "group",
    };
    if (header.create_time) meta.feishu_create_time = header.create_time;
    if (isBotMentioned) meta.bot_mentioned = true;

    const isGroup = chatType === "group";
    const receiveId = isGroup ? chatId : senderId;
    const receiveIdType = isGroup ? "chat_id" : "open_id";
    meta.feishu_receive_id = receiveId;
    meta.feishu_receive_id_type = receiveIdType;

    this.receiveIdMap.set(senderId, chatId);

    const sessionId = this.resolveSessionId(senderId, meta);
    this.saveReceiveId(sessionId, receiveIdType, receiveId);
    if (senderId) {
      this.saveReceiveId(`feishu:${senderId}`, "open_id", senderId);
    }

    const contentParts: MessageContent[] = [];
    const textParts: string[] = [];

    if (msgType === "text") {
      const text = extractJsonKey(contentRaw, "text");
      if (text) {
        let cleaned = text;
        for (const key of botMentionKeys) {
          cleaned = cleaned.replace(key, "");
        }
        cleaned = cleaned.trim();
        if (cleaned) textParts.push(cleaned);
      }
    } else if (msgType === "post") {
      const text = extractPostText(contentRaw);
      if (text) textParts.push(text);
      for (const imgKey of extractPostImageKeys(contentRaw)) {
        const localPath = await this.downloadImageResource(msgId, imgKey);
        if (localPath) {
          contentParts.push({ type: "image", url: localPath });
        } else {
          textParts.push("[image: download failed]");
        }
      }
      for (const fileKey of extractPostMediaFileKeys(contentRaw)) {
        const localPath = await this.downloadFileResource(msgId, fileKey);
        if (localPath) {
          contentParts.push({ type: "file", url: localPath });
        } else {
          textParts.push("[media: download failed]");
        }
      }
    } else if (msgType === "image") {
      const imageKey = extractJsonKey(contentRaw, "image_key", "file_key", "imageKey", "fileKey");
      if (imageKey) {
        const localPath = await this.downloadImageResource(msgId, imageKey);
        if (localPath) {
          contentParts.push({ type: "image", url: localPath });
        } else {
          textParts.push("[image: download failed]");
        }
      } else {
        textParts.push("[image: missing key]");
      }
    } else if (msgType === "file") {
      const fileKey = extractJsonKey(contentRaw, "file_key", "fileKey");
      const fileName = extractJsonKey(contentRaw, "file_name", "fileName");
      if (fileKey) {
        const localPath = await this.downloadFileResource(
          msgId,
          fileKey,
          fileName || "file.bin",
        );
        if (localPath) {
          contentParts.push({ type: "file", url: localPath, filename: fileName });
        } else {
          textParts.push("[file: download failed]");
        }
      } else {
        textParts.push("[file: missing key]");
      }
    } else if (msgType === "media") {
      const fileKey = extractJsonKey(contentRaw, "file_key", "fileKey");
      const fileName = extractJsonKey(contentRaw, "file_name", "fileName");
      if (fileKey) {
        const localPath = await this.downloadFileResource(
          msgId,
          fileKey,
          fileName || "video.mp4",
        );
        if (localPath) {
          contentParts.push({ type: "video", url: localPath });
        } else {
          textParts.push("[video: download failed]");
        }
      } else {
        textParts.push("[video: missing key]");
      }
    } else if (msgType === "audio") {
      const fileKey = extractJsonKey(contentRaw, "file_key", "fileKey");
      if (fileKey) {
        const localPath = await this.downloadFileResource(msgId, fileKey, "audio.opus");
        if (localPath) {
          contentParts.push({ type: "audio", url: localPath });
        } else {
          textParts.push("[audio: download failed]");
        }
      } else {
        textParts.push("[audio: missing key]");
      }
    } else {
      textParts.push(`[${msgType}]`);
    }

    const text = textParts.join("\n").trim();
    if (text) {
      contentParts.unshift({ type: "text", text });
    }
    if (contentParts.length === 0) return;

    await this.addReaction(msgId, FEISHU_REACTION_TYPING);

    const message2 = this.buildMessage({ senderId: senderDisplay, content: contentParts, meta });

    if (this._enqueue) {
      this._enqueue(message2);
    } else {
      await this.consumeOne(message2);
    }
  }

  private isStaleMessage(header: Record<string, unknown>): boolean {
    const createTime = header.create_time as string | number | undefined;
    if (!createTime) return false;
    const createMs = typeof createTime === "number" ? createTime : parseInt(createTime as string, 10);
    if (isNaN(createMs)) return false;
    const nowMs = Date.now() + this.clockOffset;
    const ageMs = nowMs - createMs;
    if (ageMs > FEISHU_STALE_MSG_THRESHOLD_MS) {
      logger.debug(`Feishu: drop stale message age=${(ageMs / 1000).toFixed(1)}s (retry)`);
      return true;
    }
    return false;
  }

  private async getUserNameByOpenId(openId: string): Promise<string | undefined> {
    if (!openId || openId.startsWith("unknown_")) return undefined;
    const cached = this.nicknameCache.get(openId);
    if (cached) return cached;
    if (!this.client) return undefined;
    try {
      const resp = await this.client.contact.v3.user.get({
        params: { user_id_type: "open_id" },
        path: { user_id: openId },
      });
      if (resp.code !== 0) {
        logger.debug(`Feishu get user name api error: open_id=${openId.slice(0, 20)} code=${resp.code}`);
        return undefined;
      }
      const user = resp.data?.user;
      if (!user) return undefined;
      const name = user.name || user.en_name || user.nickname;
      if (typeof name === "string" && name.trim()) {
        if (this.nicknameCache.size >= FEISHU_NICKNAME_CACHE_MAX) {
          const firstKey = this.nicknameCache.keys().next().value;
          if (firstKey) this.nicknameCache.delete(firstKey);
        }
        this.nicknameCache.set(openId, name.trim());
        return name.trim();
      }
    } catch (error) {
      logger.debug(`Feishu get user name failed: open_id=${openId.slice(0, 16)} error=${error}`);
    }
    return undefined;
  }

  private async addReaction(messageId: string, emojiType: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.im.v1.messageReaction.create({
        data: {
          reaction_type: { emoji_type: emojiType },
        },
        path: { message_id: messageId },
      });
    } catch (error) {
      logger.debug(`Feishu reaction error: ${error}`);
    }
  }

  private async downloadImageResource(
    messageId: string,
    imageKey: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const resp = await this.client.im.v1.messageResource.get({
        params: { type: "image" },
        path: { message_id: messageId, file_key: imageKey },
      });
      if (!resp.writeFile) {
        logger.debug(`Feishu image download: no writeFile in response`);
        return null;
      }
      const tmpPath = join(this.mediaDir, `tmp_${Date.now()}_${safeFilename(imageKey)}`);
      await resp.writeFile(tmpPath);
      const data = await readFile(tmpPath);
      const ext = detectFileExt(Buffer.from(data), "jpg");
      const finalPath = join(this.mediaDir, `${messageId}_${safeFilename(imageKey)}.${ext}`);
      await writeFile(finalPath, data);
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      logger.debug(`Feishu image downloaded: ${finalPath}`);
      return finalPath;
    } catch (error) {
      logger.debug(`Feishu image download failed: ${error}`);
      return null;
    }
  }

  private async downloadFileResource(
    messageId: string,
    fileKey: string,
    filenameHint = "file.bin",
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const resp = await this.client.im.v1.messageResource.get({
        params: { type: "file" },
        path: { message_id: messageId, file_key: fileKey },
      });
      if (!resp.writeFile) {
        logger.debug(`Feishu file download: no writeFile in response`);
        return null;
      }
      const filename = filenameHint.replace(/[^\w.\-]/g, "_") || "file.bin";
      const finalPath = join(this.mediaDir, `${messageId}_${filename}`);
      await resp.writeFile(finalPath);
      logger.debug(`Feishu file downloaded: ${finalPath}`);
      return finalPath;
    } catch (error) {
      logger.debug(`Feishu file download failed: ${error}`);
      return null;
    }
  }

  async sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void> {
    const text = this.renderer.renderContent(response.content);
    await this.sendText(response.toHandle, text, meta);
  }

  async sendText(toHandle: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    const recv = await this.getReceiveForSend(toHandle, meta);
    if (!recv) {
      logger.warn(`Feishu send: no receive_id for toHandle=${toHandle.slice(0, 50)}`);
      return;
    }
    const [receiveIdType, receiveId] = recv;
    await this.sendTextMessage(receiveIdType, receiveId, text);

    const lastMsgId = meta?._last_sent_message_id as string | undefined;
    if (lastMsgId) {
      await this.addReaction(lastMsgId, FEISHU_REACTION_DONE);
    }
  }

  private async sendTextMessage(
    receiveIdType: string,
    receiveId: string,
    body: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    const hasTable = /^\s*\|/m.test(body);
    if (hasTable) {
      const chunks = buildInteractiveContentChunks(body);
      let lastMsgId: string | null = null;
      for (const chunk of chunks) {
        const msgId = await this.sendMessage(receiveIdType, receiveId, "interactive", chunk);
        if (msgId) lastMsgId = msgId;
      }
      return lastMsgId;
    }
    const post = this.buildPostContent(body, []);
    const content = JSON.stringify(post);
    return this.sendMessage(receiveIdType, receiveId, "post", content);
  }

  private async sendMessage(
    receiveIdType: string,
    receiveId: string,
    msgType: string,
    content: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const resp = await this.client.im.v1.message.create({
        data: {
          receive_id: receiveId,
          msg_type: msgType,
          content,
        },
        params: {
          receive_id_type: receiveIdType as "open_id" | "user_id" | "union_id" | "email" | "chat_id",
        },
      });
      const msgId = resp.data?.message_id ?? null;
      logger.debug(`Feishu sendMessage: msg_type=${msgType} msg_id=${msgId?.slice(0, 24) ?? "null"}`);
      return msgId;
    } catch (error) {
      logger.error(`Feishu send message failed: ${error}`);
      return null;
    }
  }

  private buildPostContent(
    text: string,
    imageKeys: string[],
  ): Record<string, unknown> {
    const contentRows: Array<Array<Record<string, unknown>>> = [];
    if (text) {
      contentRows.push([{ tag: "md", text: normalizeFeishuMd(text) }]);
    }
    for (const imageKey of imageKeys) {
      contentRows.push([{ tag: "img", image_key: imageKey }]);
    }
    if (contentRows.length === 0) {
      contentRows.push([{ tag: "md", text: "[empty]" }]);
    }
    return {
      zh_cn: {
        content: contentRows,
      },
    };
  }

  private async uploadImage(data: Buffer, _filename: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const resp = await this.client.im.v1.image.create({
        data: {
          image_type: "message",
          image: data,
        },
      });
      const key = resp?.image_key ?? null;
      logger.debug(`Feishu uploadImage: image_key=${key?.slice(0, 24) ?? "null"}`);
      return key;
    } catch (error) {
      logger.error(`Feishu image upload failed: ${error}`);
      return null;
    }
  }

  private async uploadFile(
    filePath: string,
    fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream",
    fileName: string,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const fileBuffer = await readFile(filePath);
      if (fileBuffer.length > FEISHU_FILE_MAX_BYTES) {
        logger.warn(`Feishu file too large: ${fileBuffer.length} bytes`);
        return null;
      }
      const resp = await this.client.im.v1.file.create({
        data: {
          file_type: fileType,
          file_name: fileName,
          file: fileBuffer,
        },
      });
      const key = resp?.file_key ?? null;
      logger.debug(`Feishu uploadFile: file_key=${key?.slice(0, 24) ?? "null"}`);
      return key;
    } catch (error) {
      logger.error(`Feishu file upload failed: ${error}`);
      return null;
    }
  }

  async sendImage(
    toHandle: string,
    imageData: Buffer,
    filename: string,
    meta?: Record<string, unknown>,
  ): Promise<string | null> {
    const recv = await this.getReceiveForSend(toHandle, meta);
    if (!recv) return null;
    const [receiveIdType, receiveId] = recv;
    const imageKey = await this.uploadImage(imageData, filename);
    if (!imageKey) return null;
    const content = JSON.stringify({ image_key: imageKey });
    return this.sendMessage(receiveIdType, receiveId, "image", content);
  }

  async sendFile(
    toHandle: string,
    filePath: string,
    fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream",
    fileName: string,
    meta?: Record<string, unknown>,
  ): Promise<string | null> {
    const recv = await this.getReceiveForSend(toHandle, meta);
    if (!recv) return null;
    const [receiveIdType, receiveId] = recv;
    const fileKey = await this.uploadFile(filePath, fileType, fileName);
    if (!fileKey) return null;
    const content = JSON.stringify({ file_key: fileKey });
    return this.sendMessage(receiveIdType, receiveId, "file", content);
  }

  private async getReceiveForSend(
    toHandle: string,
    meta?: Record<string, unknown>,
  ): Promise<[string, string] | null> {
    const m = meta ?? {};
    const rid = m.feishu_receive_id as string | undefined;
    const rtype = (m.feishu_receive_id_type as string) ?? "open_id";
    if (rid) return [rtype, rid];

    const route = this.routeFromHandle(toHandle);
    const sessionKey = route.sessionKey;
    if (sessionKey) {
      const loaded = this.loadReceiveId(sessionKey);
      if (loaded) return [loaded.receiveIdType, loaded.receiveId];
      if (sessionKey.startsWith("feishu:open_id:")) {
        const openId = sessionKey.replace("feishu:open_id:", "");
        if (openId) return ["open_id", openId];
      }
      if (sessionKey.includes("#")) {
        const suffix = sessionKey.split("#").pop()?.trim();
        if (suffix && suffix.length >= 4) {
          for (const [, entry] of this.receiveIdStore) {
            if (entry.receiveId.endsWith(suffix)) {
              return [entry.receiveIdType, entry.receiveId];
            }
          }
        }
      }
      logger.warn(`Feishu: no store entry for session_key=${sessionKey.slice(0, 40)}`);
    }
    if (route.receiveId && route.receiveIdType) {
      return [route.receiveIdType, route.receiveId];
    }
    const loaded = this.loadReceiveId(toHandle);
    return loaded ? [loaded.receiveIdType, loaded.receiveId] : null;
  }

  private routeFromHandle(toHandle: string): {
    receiveIdType?: string;
    receiveId?: string;
    sessionKey?: string;
  } {
    const s = toHandle.trim();
    if (s.startsWith("feishu:sw:")) {
      return { sessionKey: s.replace("feishu:sw:", "") };
    }
    if (s.startsWith("feishu:chat_id:")) {
      return { receiveIdType: "chat_id", receiveId: s.replace("feishu:chat_id:", "") };
    }
    if (s.startsWith("feishu:open_id:")) {
      return { receiveIdType: "open_id", receiveId: s.replace("feishu:open_id:", "") };
    }
    if (s.startsWith("oc_")) {
      return { receiveIdType: "chat_id", receiveId: s };
    }
    if (s.startsWith("ou_")) {
      return { receiveIdType: "open_id", receiveId: s };
    }
    return { sessionKey: s };
  }

  private saveReceiveId(sessionId: string, receiveIdType: string, receiveId: string): void {
    if (!sessionId || !receiveId) return;
    this.receiveIdStore.set(sessionId, {
      receiveIdType,
      receiveId,
      updatedAt: Date.now(),
    });
    this.saveReceiveIdStoreToDisk();
    if (this.db) {
      try {
        this.db.saveReceiveId(sessionId, this.channelType, receiveIdType, receiveId);
      } catch (error) {
        logger.debug(`Feishu save receive_id to DB failed: ${error}`);
      }
    }
  }

  private loadReceiveId(sessionId: string): ReceiveIdEntry | undefined {
    const cached = this.receiveIdStore.get(sessionId);
    if (cached) return cached;
    this.loadReceiveIdStoreFromDisk();
    const fromFile = this.receiveIdStore.get(sessionId);
    if (fromFile) return fromFile;
    if (this.db) {
      try {
        const fromDb = this.db.loadReceiveId(sessionId, this.channelType);
        if (fromDb) {
          const entry: ReceiveIdEntry = {
            receiveIdType: fromDb.receiveIdType,
            receiveId: fromDb.receiveId,
            updatedAt: Date.now(),
          };
          this.receiveIdStore.set(sessionId, entry);
          return entry;
        }
      } catch (error) {
        logger.debug(`Feishu load receive_id from DB failed: ${error}`);
      }
    }
    return undefined;
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

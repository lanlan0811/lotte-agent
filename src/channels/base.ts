import type {
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  ChannelStatus,
  ChannelInfo,
  ProcessHandler,
  OnReplySent,
  EnqueueCallback,
  MessageContent,
} from "./types.js";
import { formatErrorMessage } from "../errors/errors.js";

export abstract class BaseChannel {
  abstract readonly channelType: ChannelType;
  abstract readonly channelName: string;

  usesManagerQueue = true;

  protected _process: ProcessHandler;
  protected _onReplySent: OnReplySent = null;
  protected _enqueue: EnqueueCallback = null;
  protected _status: ChannelStatus = "stopped";
  protected _error: string | null = null;
  protected _messageCount = 0;
  protected _connectedAt: number | null = null;

  dmPolicy: "open" | "allowlist" | "denylist" = "open";
  groupPolicy: "open" | "allowlist" | "denylist" = "open";
  allowFrom: Set<string> = new Set();
  denyMessage = "";
  botPrefix = "";
  showToolDetails = true;
  filterToolMessages = false;
  filterThinking = false;

  constructor(process: ProcessHandler, onReplySent: OnReplySent = null) {
    this._process = process;
    this._onReplySent = onReplySent;
  }

  setEnqueue(cb: EnqueueCallback): void {
    this._enqueue = cb;
  }

  get status(): ChannelStatus {
    return this._status;
  }

  get error(): string | null {
    return this._error;
  }

  getInfo(): ChannelInfo {
    return {
      type: this.channelType,
      name: this.channelName,
      status: this._status,
      enabled: true,
      error: this._error ?? undefined,
      connectedAt: this._connectedAt ?? undefined,
      messageCount: this._messageCount,
    };
  }

  resolveSessionId(senderId: string, _meta?: Record<string, unknown>): string {
    return `${this.channelType}:${senderId}`;
  }

  checkAllowlist(senderId: string, isGroup: boolean): { allowed: boolean; message?: string } {
    const policy = isGroup ? this.groupPolicy : this.dmPolicy;
    if (policy === "open") return { allowed: true };
    if (this.allowFrom.has(senderId)) return { allowed: true };
    if (this.denyMessage) return { allowed: false, message: this.denyMessage };
    return {
      allowed: false,
      message: isGroup
        ? "Sorry, this bot is only available to authorized users."
        : `Sorry, you are not authorized to use this bot. Your ID: ${senderId}`,
    };
  }

  protected buildMessage(opts: {
    senderId: string;
    sessionId?: string;
    content: MessageContent[];
    meta?: Record<string, unknown>;
  }): ChannelMessage {
    const sessionId = opts.sessionId ?? this.resolveSessionId(opts.senderId, opts.meta);
    return {
      id: `${this.channelType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelType: this.channelType,
      senderId: opts.senderId,
      sessionId,
      content: opts.content,
      meta: opts.meta ?? {},
      timestamp: Date.now(),
    };
  }

  async consumeOne(payload: ChannelMessage): Promise<void> {
    try {
      const { allowed, message } = this.checkAllowlist(
        payload.senderId,
        Boolean(payload.meta?.isGroup),
      );
      if (!allowed) {
        if (message) {
          await this.sendText(payload.sessionId, message, payload.meta);
        }
        return;
      }

      if (this.botPrefix && payload.content.length > 0) {
        const first = payload.content[0];
        if (first && first.type === "text" && "text" in first && first.text.trim().startsWith(this.botPrefix)) {
          first.text = first.text.trim().slice(this.botPrefix.length).trim();
        }
      }

      const response = await this._process(payload);
      if (response) {
        await this.sendResponse(response, payload.meta);
      }

      this._messageCount++;
      if (this._onReplySent) {
        this._onReplySent(this.channelType, payload.senderId, payload.sessionId);
      }
    } catch (error) {
      const msg = formatErrorMessage(error);
      console.error(`[${this.channelType}] consumeOne error: ${msg}`);
      try {
        await this.sendText(
          payload.sessionId,
          "Sorry, an internal error occurred while processing your message.",
          payload.meta,
        );
      } catch {
        // ignore send error
      }
    }
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  abstract sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void>;

  abstract sendText(toHandle: string, text: string, meta?: Record<string, unknown>): Promise<void>;

  protected extractTextFromContent(content: MessageContent[]): string {
    const texts: string[] = [];
    for (const c of content) {
      if (c.type === "text") texts.push(c.text);
    }
    return texts.join("\n");
  }

  protected splitText(text: string, maxLength: number = 2000): string[] {
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf("\n", maxLength);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLength);
      if (splitAt <= 0) splitAt = maxLength;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }
}

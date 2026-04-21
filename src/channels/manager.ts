import type { BaseChannel } from "./base.js";
import type { ChannelMessage, ProcessHandler, OnReplySent, QueueKey, ChannelInfo } from "./types.js";
import { PRIORITY_NORMAL } from "./types.js";
import { UnifiedQueueManager } from "./queue.js";
import { DualLevelDebouncer } from "./debounce.js";
import { logger } from "../utils/logger.js";

export class ChannelManager {
  private channels: Map<string, BaseChannel> = new Map();
  private queueManager: UnifiedQueueManager | null = null;
  private debouncer: DualLevelDebouncer;
  private _process: ProcessHandler;
  private _onReplySent: OnReplySent | null;
  private _running = false;

  constructor(process: ProcessHandler, onReplySent: OnReplySent | null = null) {
    this._process = process;
    this._onReplySent = onReplySent;
    void this._process;
    void this._onReplySent;

    this.debouncer = new DualLevelDebouncer({
      flushCallback: async (messages, _sessionId, _senderId) => {
        for (const item of messages) {
          const channelMsg = item as { message: ChannelMessage };
          const channelId = channelMsg.message.channelType;
          this.enqueue(channelId, channelMsg.message);
        }
      },
      typingCallback: async (_sessionId, _senderId) => {
        for (const channel of this.channels.values()) {
          try {
            if ("sendTyping" in channel && typeof (channel as Record<string, unknown>).sendTyping === "function") {
              const ch = channel as unknown as { sendTyping: (sessionId: string) => Promise<void> };
              await ch.sendTyping(_sessionId);
            }
          } catch {
            // Ignore typing indicator errors
          }
        }
      },
    });
  }

  register(channel: BaseChannel): void {
    this.channels.set(channel.channelType, channel);
    logger.info(`Channel registered: ${channel.channelType} (${channel.channelName})`);
  }

  unregister(channelType: string): void {
    this.channels.delete(channelType);
  }

  getChannel(channelType: string): BaseChannel | undefined {
    return this.channels.get(channelType);
  }

  getAllChannels(): BaseChannel[] {
    return Array.from(this.channels.values());
  }

  getChannelInfos(): ChannelInfo[] {
    return this.getAllChannels().map((ch) => ch.getInfo());
  }

  private makeEnqueueCallback(channelId: string): (payload: ChannelMessage) => void {
    return (payload: ChannelMessage) => {
      this.enqueue(channelId, payload);
    };
  }

  enqueue(channelId: string, payload: ChannelMessage): void {
    if (!this.queueManager) {
      logger.warn(`Queue manager not initialized, cannot enqueue for channel=${channelId}`);
      return;
    }

    const sessionId = payload.sessionId || `${channelId}:${payload.senderId}`;
    const queueKey: QueueKey = {
      channelId,
      sessionId,
      priority: PRIORITY_NORMAL,
    };

    this.queueManager.enqueue(queueKey, payload).catch((err) => {
      logger.error(`Enqueue failed: channel=${channelId} session=${sessionId} error=${err}`);
    });
  }

  enqueueDebounced(channelId: string, payload: ChannelMessage): void {
    const sessionId = payload.sessionId || `${channelId}:${payload.senderId}`;
    this.debouncer.push(sessionId, payload.senderId, payload);
  }

  private async consumeMessage(
    _queue: AsyncIterable<unknown>,
    channelId: string,
    _sessionId: string,
    _priority: number,
  ): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      logger.error(`Consumer: channel not found: ${channelId}`);
      return;
    }

    for await (const payload of _queue) {
      try {
        await channel.consumeOne(payload as ChannelMessage);
      } catch (error) {
        logger.error(`Consumer error for channel=${channelId}: ${error}`);
      }
    }
  }

  async startAll(): Promise<void> {
    if (this._running) return;

    this.queueManager = new UnifiedQueueManager({
      consumerFn: this.consumeMessage.bind(this),
    });
    this.queueManager.startCleanupLoop();

    for (const channel of this.channels.values()) {
      if (channel.usesManagerQueue) {
        channel.setEnqueue(this.makeEnqueueCallback(channel.channelType));
      }
    }

    for (const channel of this.channels.values()) {
      try {
        await channel.start();
        logger.info(`Channel started: ${channel.channelType}`);
      } catch (error) {
        logger.error(`Failed to start channel ${channel.channelType}: ${error}`);
      }
    }

    this._running = true;
    logger.info(`ChannelManager started with ${this.channels.size} channels`);
  }

  async stopAll(): Promise<void> {
    if (!this._running) return;

    this.debouncer.cleanupAll();

    if (this.queueManager) {
      await this.queueManager.stopAll();
      this.queueManager = null;
    }

    for (const channel of this.channels.values()) {
      channel.setEnqueue(null);
    }

    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (error) {
        logger.error(`Failed to stop channel ${channel.channelType}: ${error}`);
      }
    }

    this._running = false;
    logger.info("ChannelManager stopped");
  }

  isRunning(): boolean {
    return this._running;
  }

  async sendCrossChannel(
    channelType: string,
    toHandle: string,
    text: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const channel = this.channels.get(channelType);
    if (!channel) {
      throw new Error(`Channel not found: ${channelType}`);
    }
    await channel.sendText(toHandle, text, meta);
  }
}

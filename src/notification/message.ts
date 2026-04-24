import type { NotificationEvent, NotificationResult } from "./types.js";
import type { ChannelManager } from "../channels/manager.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export class MessageNotifier {
  private channelManager: ChannelManager | null;
  private enabledChannels: string[];

  constructor(channelManager: ChannelManager | null, channels: string[]) {
    this.channelManager = channelManager;
    this.enabledChannels = channels;
  }

  async send(event: NotificationEvent): Promise<NotificationResult[]> {
    if (!this.channelManager) {
      return [
        {
          channel: "message",
          success: false,
          error: "Channel manager not available",
        },
      ];
    }

    if (this.enabledChannels.length === 0) {
      return [
        {
          channel: "message",
          success: false,
          error: "No channels configured for notification",
        },
      ];
    }

    const results: NotificationResult[] = [];
    const text = this.formatMessage(event);

    for (const channelId of this.enabledChannels) {
      try {
        await this.channelManager.sendCrossChannel(channelId, "notification", text);
        results.push({ channel: channelId, success: true });
      } catch (error) {
        const msg = formatErrorMessage(error);
        logger.error(`Message notification failed for channel ${channelId}: ${msg}`);
        results.push({ channel: channelId, success: false, error: msg });
      }
    }

    return results;
  }

  private formatMessage(event: NotificationEvent): string {
    const emoji = this.getEventEmoji(event.type);
    return `${emoji} [${event.type}] ${event.title}\n\n${event.message}`;
  }

  private getEventEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      "cron.complete": "✅",
      "cron.error": "❌",
      "approval.request": "🔔",
      "approval.resolved": "✔️",
      "channel.status": "📡",
      "system.error": "🚨",
      "system.warning": "⚠️",
      custom: "📢",
    };
    return emojiMap[type] ?? "📢";
  }
}

import type { NotificationConfig } from "../config/schema.js";
import type { ChannelManager } from "../channels/manager.js";
import type { NotificationEvent, NotificationRule, NotificationResult } from "./types.js";
import { MessageNotifier } from "./message.js";
import { WebhookNotifier } from "./webhook.js";
import { EmailNotifier } from "./email.js";
import { logger } from "../utils/logger.js";

export class NotificationDispatcher {
  private rules: NotificationRule[];
  private messageNotifier: MessageNotifier;
  private webhookNotifier: WebhookNotifier;
  private emailNotifier: EmailNotifier;

  constructor(config: NotificationConfig, channelManager: ChannelManager | null) {
    this.rules = [];

    this.messageNotifier = new MessageNotifier(
      channelManager,
      config.message.channels,
    );

    this.webhookNotifier = new WebhookNotifier({
      enabled: config.webhook.enabled,
      url: config.webhook.url,
      headers: config.webhook.headers,
    });

    this.emailNotifier = new EmailNotifier({
      enabled: config.email.enabled,
      smtp_host: config.email.smtp_host,
      smtp_port: config.email.smtp_port,
      sender: config.email.sender,
      password: config.email.password,
      recipients: config.email.recipients,
    });
  }

  addRule(rule: NotificationRule): void {
    this.rules.push(rule);
  }

  removeRule(eventType: string): void {
    this.rules = this.rules.filter((r) => r.event_type !== eventType);
  }

  async dispatch(event: NotificationEvent): Promise<NotificationResult[]> {
    const matchedRules = this.getMatchingRules(event.type);
    const allResults: NotificationResult[] = [];

    if (matchedRules.length === 0) {
      logger.debug(`No notification rules matched for event: ${event.type}`);
      return allResults;
    }

    for (const rule of matchedRules) {
      if (rule.channels.length > 0 && this.messageNotifier) {
        const results = await this.messageNotifier.send(event);
        allResults.push(...results);
      }

      if (rule.webhook) {
        const result = await this.webhookNotifier.send(event);
        allResults.push(result);
      }

      if (rule.email) {
        const result = await this.emailNotifier.send(event);
        allResults.push(result);
      }
    }

    const successCount = allResults.filter((r) => r.success).length;
    const failCount = allResults.filter((r) => !r.success).length;
    logger.debug(
      `Notification dispatched for "${event.type}": ${successCount} success, ${failCount} failed`,
    );

    return allResults;
  }

  async notify(
    type: NotificationEvent["type"],
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<NotificationResult[]> {
    const event: NotificationEvent = {
      type,
      title,
      message,
      data,
      timestamp: Date.now(),
    };

    return this.dispatch(event);
  }

  private getMatchingRules(eventType: string): NotificationRule[] {
    return this.rules.filter(
      (rule) => rule.event_type === eventType || rule.event_type === "*",
    );
  }
}

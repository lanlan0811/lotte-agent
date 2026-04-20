import type { NotificationConfig } from "../config/schema.js";
import type { ChannelManager } from "../channels/manager.js";
import type { NotificationEvent, NotificationRule, NotificationResult } from "./types.js";
import { MessageNotifier } from "./message.js";
import { WebhookNotifier } from "./webhook.js";
import { EmailNotifier } from "./email.js";
import { logger } from "../utils/logger.js";

export interface ManagedNotificationRule {
  id: string;
  name: string;
  eventTypes: string[];
  channels: Array<{ type: "message" | "webhook" | "email"; target: string }>;
  enabled: boolean;
  createdAt: number;
}

export interface WebhookConfigView {
  url: string;
  method: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export interface EmailConfigView {
  smtp_host: string;
  smtp_port: number;
  from: string;
  to: string[];
  enabled: boolean;
}

export class NotificationDispatcher {
  private rules: NotificationRule[];
  private managedRules: ManagedNotificationRule[] = [];
  private messageNotifier: MessageNotifier;
  private webhookNotifier: WebhookNotifier;
  private emailNotifier: EmailNotifier;
  private webhookConfigView: WebhookConfigView;
  private emailConfigView: EmailConfigView;

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

    this.webhookConfigView = {
      url: config.webhook.url,
      method: "POST",
      headers: config.webhook.headers,
      enabled: config.webhook.enabled,
    };

    this.emailConfigView = {
      smtp_host: config.email.smtp_host,
      smtp_port: config.email.smtp_port,
      from: config.email.sender,
      to: config.email.recipients,
      enabled: config.email.enabled,
    };
  }

  addLegacyRule(rule: NotificationRule): void {
    this.rules.push(rule);
  }

  removeLegacyRule(eventType: string): void {
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

  getRules(): ManagedNotificationRule[] {
    return this.managedRules;
  }

  addManagedRule(input: Omit<ManagedNotificationRule, "id" | "createdAt">): ManagedNotificationRule {
    const rule: ManagedNotificationRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      eventTypes: input.eventTypes,
      channels: input.channels,
      enabled: input.enabled,
      createdAt: Date.now(),
    };
    this.managedRules.push(rule);
    return rule;
  }

  updateRule(ruleId: string, updates: { enabled?: boolean; name?: string; eventTypes?: string[] }): ManagedNotificationRule | null {
    const idx = this.managedRules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return null;
    const existing = this.managedRules[idx]!;
    this.managedRules[idx] = {
      id: existing.id,
      name: updates.name ?? existing.name,
      eventTypes: updates.eventTypes ?? existing.eventTypes,
      channels: existing.channels,
      enabled: updates.enabled ?? existing.enabled,
      createdAt: existing.createdAt,
    };
    return this.managedRules[idx];
  }

  removeRule(ruleId: string): boolean {
    const len = this.managedRules.length;
    this.managedRules = this.managedRules.filter((r) => r.id !== ruleId);
    return this.managedRules.length < len;
  }

  getWebhookConfig(): WebhookConfigView {
    return this.webhookConfigView;
  }

  getEmailConfig(): EmailConfigView {
    return this.emailConfigView;
  }

  updateWebhookConfig(updates: Partial<WebhookConfigView>): void {
    this.webhookConfigView = { ...this.webhookConfigView, ...updates };
  }

  updateEmailConfig(updates: Partial<EmailConfigView>): void {
    this.emailConfigView = { ...this.emailConfigView, ...updates };
  }

  async testChannel(channel: string): Promise<void> {
    const testEvent: NotificationEvent = {
      type: "custom",
      title: "Test Notification",
      message: "This is a test notification from Lotte Agent.",
      timestamp: Date.now(),
    };

    switch (channel) {
      case "webhook":
        await this.webhookNotifier.send(testEvent);
        break;
      case "email":
        await this.emailNotifier.send(testEvent);
        break;
      case "message":
        await this.messageNotifier.send(testEvent);
        break;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }
}

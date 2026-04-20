import type { NotificationEvent, NotificationResult } from "./types.js";
import { logger } from "../utils/logger.js";

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export class WebhookNotifier {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  async send(event: NotificationEvent): Promise<NotificationResult> {
    if (!this.config.enabled) {
      return { channel: "webhook", success: false, error: "Webhook not enabled" };
    }

    if (!this.config.url) {
      return { channel: "webhook", success: false, error: "Webhook URL not configured" };
    }

    const payload = {
      event_type: event.type,
      title: event.title,
      message: event.message,
      data: event.data ?? null,
      timestamp: event.timestamp,
    };

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(this.config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.config.headers,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          logger.debug(`Webhook notification sent successfully (attempt ${attempt})`);
          return { channel: "webhook", success: true };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;

        if (response.status >= 400 && response.status < 500) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.debug(`Webhook attempt ${attempt} failed: ${lastError}`);
      }

      if (attempt < DEFAULT_RETRY_ATTEMPTS) {
        await this.delay(RETRY_DELAY_MS * attempt);
      }
    }

    logger.error(`Webhook notification failed after ${DEFAULT_RETRY_ATTEMPTS} attempts: ${lastError}`);
    return { channel: "webhook", success: false, error: lastError };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

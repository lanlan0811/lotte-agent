import nodemailer from "nodemailer";
import type { NotificationEvent, NotificationResult } from "./types.js";
import { logger } from "../utils/logger.js";

export interface EmailConfig {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  sender: string;
  password: string;
  recipients: string[];
}

export class EmailNotifier {
  private config: EmailConfig;
  private transporter: nodemailer.Transporter | null = null;

  constructor(config: EmailConfig) {
    this.config = config;

    if (this.config.enabled && this.config.smtp_host && this.config.sender) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp_host,
        port: this.config.smtp_port,
        secure: this.config.smtp_port === 465,
        auth: {
          user: this.config.sender,
          pass: this.config.password,
        },
      });
    }
  }

  async send(event: NotificationEvent): Promise<NotificationResult> {
    if (!this.config.enabled) {
      return { channel: "email", success: false, error: "Email not enabled" };
    }

    if (!this.transporter) {
      return { channel: "email", success: false, error: "Email transporter not configured" };
    }

    if (this.config.recipients.length === 0) {
      return { channel: "email", success: false, error: "No recipients configured" };
    }

    const subject = `[Lotte] ${event.type}: ${event.title}`;
    const html = this.formatHtml(event);

    try {
      const result = await this.transporter.sendMail({
        from: this.config.sender,
        to: this.config.recipients.join(", "),
        subject,
        html,
      });

      logger.debug(`Email notification sent: ${result.messageId}`);
      return { channel: "email", success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Email notification failed: ${msg}`);
      return { channel: "email", success: false, error: msg };
    }
  }

  private formatHtml(event: NotificationEvent): string {
    const timestamp = new Date(event.timestamp).toISOString();
    const dataRows = event.data
      ? Object.entries(event.data)
          .map(([key, value]) => `<tr><td><strong>${key}</strong></td><td>${String(value)}</td></tr>`)
          .join("\n")
      : "";

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <div style="background: #1e293b; color: white; padding: 16px 20px;">
      <h2 style="margin: 0; font-size: 18px;">${this.escapeHtml(event.title)}</h2>
      <span style="font-size: 12px; opacity: 0.8;">${event.type} · ${timestamp}</span>
    </div>
    <div style="padding: 20px; background: white;">
      <p style="margin: 0 0 16px; line-height: 1.6;">${this.escapeHtml(event.message)}</p>
      ${dataRows ? `<table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <thead><tr style="background: #f8fafc;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Key</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Value</th></tr></thead>
        <tbody>${dataRows}</tbody>
      </table>` : ""}
    </div>
    <div style="background: #f8fafc; padding: 12px 20px; font-size: 12px; color: #64748b;">
      Sent by Lotte Agent Notification System
    </div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

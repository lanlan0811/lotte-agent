export type NotificationEventType =
  | "cron.complete"
  | "cron.error"
  | "approval.request"
  | "approval.resolved"
  | "channel.status"
  | "system.error"
  | "system.warning"
  | "custom";

export interface NotificationEvent {
  type: NotificationEventType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface NotificationRule {
  event_type: NotificationEventType | "*";
  channels: string[];
  webhook: boolean;
  email: boolean;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  error?: string;
}

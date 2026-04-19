export interface ChannelMessage {
  id: string;
  channelType: string;
  senderId: string;
  sessionId: string;
  content: MessageContent[];
  meta: Record<string, unknown>;
  timestamp: number;
}

export type MessageContent =
  | TextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | FileContent;

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  url: string;
  base64?: string;
  mimeType?: string;
}

export interface VideoContent {
  type: "video";
  url: string;
  mimeType?: string;
}

export interface AudioContent {
  type: "audio";
  url?: string;
  base64?: string;
  mimeType?: string;
  duration?: number;
}

export interface FileContent {
  type: "file";
  url?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
}

export interface ChannelResponse {
  toHandle: string;
  content: MessageContent[];
  meta?: Record<string, unknown>;
}

export type ChannelType = "weixin" | "qq" | "feishu" | "console";

export type ChannelStatus = "stopped" | "starting" | "running" | "error";

export interface ChannelInfo {
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  enabled: boolean;
  error?: string;
  connectedAt?: number;
  messageCount?: number;
}

export type ProcessHandler = (message: ChannelMessage) => Promise<ChannelResponse | null>;

export type OnReplySent = ((channelType: string, userId: string, sessionId: string) => void) | null;

export type EnqueueCallback = ((payload: ChannelMessage) => void) | null;

export interface ChannelConfig {
  enabled: boolean;
  dm_policy: "open" | "allowlist" | "denylist";
  group_policy: "open" | "allowlist" | "denylist";
  allow_from: string[];
  deny_message: string;
  bot_prefix: string;
  show_tool_details: boolean;
  filter_tool_messages: boolean;
  filter_thinking: boolean;
}

export interface QueueKey {
  channelId: string;
  sessionId: string;
  priority: number;
}

export const PRIORITY_CRITICAL = 0;
export const PRIORITY_HIGH = 10;
export const PRIORITY_NORMAL = 20;
export const PRIORITY_LOW = 30;

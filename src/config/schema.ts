import { z } from "zod";

export const LotteConfigSchema = z.object({
  app_name: z.string().default("lotte"),
  version: z.string().default("1.0.0"),
  data_dir: z.string().default(""),
  log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  language: z.string().default("zh-CN"),
  agent_concurrency: z.number().int().min(1).max(32).default(4),
  modules: z
    .object({
      agent: z.boolean().default(true),
      gateway: z.boolean().default(true),
      channels: z.boolean().default(true),
      tools: z.boolean().default(true),
      skills: z.boolean().default(true),
      mcp: z.boolean().default(true),
      automation: z.boolean().default(true),
      rag: z.boolean().default(true),
      notification: z.boolean().default(true),
      multimodal: z.boolean().default(true),
      voice: z.boolean().default(true),
      plugins: z.boolean().default(true),
    })
    .default({}),
});

export const AIConfigSchema = z.object({
  default_provider: z.string().default("openai"),
  default_model: z.string().default("gpt-4o"),
  stt: z
    .object({
      provider_type: z.enum(["disabled", "local_whisper", "whisper_api"]).default("disabled"),
      provider_id: z.string().default(""),
      model: z.string().default("whisper-1"),
    })
    .default({}),
  providers: z.record(
    z.string(),
    z.object({
      api_url: z.string().default(""),
      api_key: z.string().default(""),
      models: z
        .record(
          z.string(),
          z.object({
            context_window: z.number().positive().default(128000),
            max_output: z.number().positive().default(16384),
          }),
        )
        .default({}),
    }),
  ).default({}),
  model_aliases: z.record(z.string(), z.string()).default({}),
});

export const GatewayConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(10623),
  auth: z
    .object({
      mode: z.enum(["token", "password", "none"]).default("token"),
      token: z.string().default(""),
      password: z.string().default(""),
    })
    .default({}),
  websocket: z
    .object({
      max_connections: z.number().int().positive().default(10),
      heartbeat_interval: z.number().int().positive().default(30000),
    })
    .default({}),
  web: z
    .object({
      enabled: z.boolean().default(false),
      root: z.string().default(""),
      base_path: z.string().default(""),
    })
    .default({}),
});

export const WeixinChannelSchema = z.object({
  enabled: z.boolean().default(false),
  bot_token: z.string().default(""),
  bot_token_file: z.string().default(""),
  base_url: z.string().default(""),
  bot_prefix: z.string().default(""),
  media_dir: z.string().default(""),
  dm_policy: z.enum(["open", "allowlist", "denylist"]).default("open"),
  group_policy: z.enum(["open", "allowlist", "denylist"]).default("open"),
  allow_from: z.array(z.string()).default([]),
  deny_message: z.string().default(""),
  typing_indicator: z.boolean().default(true),
  voice_asr: z.boolean().default(false),
});

export const QQChannelSchema = z.object({
  enabled: z.boolean().default(false),
  app_id: z.string().default(""),
  client_secret: z.string().default(""),
  bot_prefix: z.string().default(""),
  markdown_enabled: z.boolean().default(true),
  max_reconnect_attempts: z.number().int().positive().default(100),
  media_dir: z.string().default(""),
});

export const FeishuChannelSchema = z.object({
  enabled: z.boolean().default(false),
  app_id: z.string().default(""),
  app_secret: z.string().default(""),
  bot_prefix: z.string().default(""),
  encrypt_key: z.string().default(""),
  verification_token: z.string().default(""),
  media_dir: z.string().default(""),
  domain: z.enum(["feishu", "lark"]).default("feishu"),
  dm_policy: z.enum(["open", "allowlist", "denylist"]).default("open"),
  group_policy: z.enum(["open", "allowlist", "denylist"]).default("open"),
  allow_from: z.array(z.string()).default([]),
  deny_message: z.string().default(""),
  require_mention: z.boolean().default(false),
});

export const ChannelsConfigSchema = z.object({
  weixin: WeixinChannelSchema.default({}),
  qq: QQChannelSchema.default({}),
  feishu: FeishuChannelSchema.default({}),
});

export const MCPClientSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  enabled: z.boolean().default(true),
  transport: z.enum(["stdio", "streamable_http", "sse"]).default("stdio"),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().default(""),
});

export const MCPConfigSchema = z.object({
  clients: z.record(z.string(), MCPClientSchema).default({}),
});

export const SkillsConfigSchema = z.object({
  schema_version: z.string().default("skill-manifest.v1"),
  version: z.number().default(0),
  skills: z.record(z.string(), z.unknown()).default({}),
  builtin_skill_names: z.array(z.string()).default([]),
  scan_mode: z.enum(["block", "warn", "off"]).default("block"),
});

export const ToolsConfigSchema = z.object({
  bash: z
    .object({
      enabled: z.boolean().default(true),
      require_approval: z.boolean().default(true),
      timeout: z.number().int().positive().default(30000),
    })
    .default({}),
  file: z
    .object({
      enabled: z.boolean().default(true),
      require_approval: z.boolean().default(false),
      allowed_paths: z.array(z.string()).default([]),
    })
    .default({}),
  browser: z
    .object({
      enabled: z.boolean().default(true),
      require_approval: z.boolean().default(true),
      headless: z.boolean().default(true),
    })
    .default({}),
  network: z
    .object({
      enabled: z.boolean().default(true),
      require_approval: z.boolean().default(false),
      allowed_domains: z.array(z.string()).default([]),
    })
    .default({}),
  git: z
    .object({
      enabled: z.boolean().default(true),
      require_approval: z.boolean().default(true),
    })
    .default({}),
  sandbox: z
    .object({
      enabled: z.boolean().default(true),
      timeout: z.number().int().positive().default(60000),
      max_memory: z.number().int().positive().default(256),
    })
    .default({}),
});

export const AutomationConfigSchema = z.object({
  cron: z
    .object({
      enabled: z.boolean().default(true),
      jobs: z.array(z.unknown()).default([]),
    })
    .default({}),
  workflow: z
    .object({
      enabled: z.boolean().default(true),
      workflows: z.array(z.unknown()).default([]),
    })
    .default({}),
  trigger: z
    .object({
      enabled: z.boolean().default(true),
      rules: z.array(z.unknown()).default([]),
    })
    .default({}),
});

export const NotificationConfigSchema = z.object({
  message: z
    .object({
      enabled: z.boolean().default(true),
      channels: z.array(z.string()).default([]),
    })
    .default({}),
  webhook: z
    .object({
      enabled: z.boolean().default(false),
      url: z.string().default(""),
      headers: z.record(z.string(), z.string()).default({}),
    })
    .default({}),
  email: z
    .object({
      enabled: z.boolean().default(false),
      smtp_host: z.string().default(""),
      smtp_port: z.number().int().positive().default(587),
      sender: z.string().default(""),
      password: z.string().default(""),
      recipients: z.array(z.string()).default([]),
    })
    .default({}),
});

export const RAGConfigSchema = z.object({
  enabled: z.boolean().default(true),
  embedding: z
    .object({
      provider: z.string().default("openai"),
      model: z.string().default("text-embedding-3-small"),
      dimension: z.number().int().positive().default(1536),
    })
    .default({}),
  chunk: z
    .object({
      size: z.number().int().positive().default(512),
      overlap: z.number().int().nonnegative().default(64),
    })
    .default({}),
  retrieval: z
    .object({
      top_k: z.number().int().positive().default(5),
      min_score: z.number().min(0).max(1).default(0.7),
    })
    .default({}),
});

export const MultimodalConfigSchema = z.object({
  vision: z
    .object({
      enabled: z.boolean().default(true),
      follow_primary_model: z.boolean().default(true),
      max_image_bytes: z.number().int().positive().default(6291456),
      max_images_per_message: z.number().int().positive().default(20),
    })
    .default({}),
  video: z
    .object({
      enabled: z.boolean().default(true),
      max_video_bytes: z.number().int().positive().default(16777216),
      max_duration_seconds: z.number().int().positive().default(120),
    })
    .default({}),
  screenshot: z
    .object({
      browser_enabled: z.boolean().default(true),
      screen_enabled: z.boolean().default(true),
    })
    .default({}),
  media: z
    .object({
      storage_dir: z.string().default(""),
      ttl_seconds: z.number().int().positive().default(120),
      http_port: z.number().int().positive().default(42873),
    })
    .default({}),
});

export const VoiceConfigSchema = z.object({
  stt: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["openai", "custom"]).default("openai"),
      model: z.string().default("whisper-1"),
      api_url: z.string().default(""),
      api_key: z.string().default(""),
      language: z.string().default("zh"),
      max_file_size: z.number().int().positive().default(26214400),
    })
    .default({}),
});

export type LotteConfig = z.infer<typeof LotteConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
export type MCPClientConfig = z.infer<typeof MCPClientSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;
export type RAGConfig = z.infer<typeof RAGConfigSchema>;
export type MultimodalConfig = z.infer<typeof MultimodalConfigSchema>;
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

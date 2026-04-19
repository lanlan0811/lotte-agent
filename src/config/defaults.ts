import type {
  LotteConfig,
  AIConfig,
  GatewayConfig,
  ChannelsConfig,
  MCPConfig,
  SkillsConfig,
  ToolsConfig,
  AutomationConfig,
  NotificationConfig,
  RAGConfig,
  MultimodalConfig,
} from "./schema.js";

export function getMainConfigDefaults(): LotteConfig {
  return {
    app_name: "lotte",
    version: "1.0.0",
    data_dir: "",
    log_level: "info",
    language: "zh-CN",
    modules: {
      agent: true,
      gateway: true,
      channels: true,
      tools: true,
      skills: true,
      mcp: true,
      automation: true,
      rag: true,
      notification: true,
      multimodal: true,
      voice: true,
      plugins: true,
    },
  };
}

export function getAIConfigDefaults(): AIConfig {
  return {
    default_provider: "openai",
    default_model: "gpt-4o",
    stt: {
      provider_type: "disabled",
      provider_id: "",
      model: "whisper-1",
    },
    providers: {
      openai: {
        api_url: "https://api.openai.com/v1",
        api_key: "",
        models: {
          "gpt-4o": {
            context_window: 128000,
            max_output: 16384,
          },
        },
      },
      anthropic: {
        api_url: "https://api.anthropic.com",
        api_key: "",
        models: {
          "claude-sonnet-4-20250514": {
            context_window: 200000,
            max_output: 8192,
          },
        },
      },
      custom: {
        api_url: "",
        api_key: "",
        models: {},
      },
    },
    model_aliases: {
      gpt: "openai/gpt-4o",
      claude: "anthropic/claude-sonnet-4-20250514",
    },
  };
}

export function getGatewayConfigDefaults(): GatewayConfig {
  return {
    host: "127.0.0.1",
    port: 10623,
    auth: {
      mode: "none",
      token: "",
      password: "",
    },
    websocket: {
      max_connections: 10,
      heartbeat_interval: 30000,
    },
  };
}

export function getChannelsConfigDefaults(): ChannelsConfig {
  return {
    weixin: {
      enabled: false,
      bot_token: "",
      bot_token_file: "",
      base_url: "",
      bot_prefix: "",
      media_dir: "",
      dm_policy: "open",
      group_policy: "open",
      allow_from: [],
      deny_message: "",
    },
    qq: {
      enabled: false,
      app_id: "",
      client_secret: "",
      bot_prefix: "",
      markdown_enabled: true,
      max_reconnect_attempts: 100,
    },
    feishu: {
      enabled: false,
      app_id: "",
      app_secret: "",
      bot_prefix: "",
      encrypt_key: "",
      verification_token: "",
      media_dir: "",
      domain: "feishu",
      dm_policy: "open",
      group_policy: "open",
      allow_from: [],
      deny_message: "",
      require_mention: false,
    },
  };
}

export function getMCPConfigDefaults(): MCPConfig {
  return {
    clients: {},
  };
}

export function getSkillsConfigDefaults(): SkillsConfig {
  return {
    schema_version: "skill-manifest.v1",
    version: 0,
    skills: {},
    builtin_skill_names: [],
    scan_mode: "block",
  };
}

export function getToolsConfigDefaults(): ToolsConfig {
  return {
    bash: {
      enabled: true,
      require_approval: true,
      timeout: 30000,
    },
    file: {
      enabled: true,
      require_approval: false,
      allowed_paths: [],
    },
    browser: {
      enabled: true,
      require_approval: true,
      headless: true,
    },
    network: {
      enabled: true,
      require_approval: false,
      allowed_domains: [],
    },
    git: {
      enabled: true,
      require_approval: true,
    },
    sandbox: {
      enabled: true,
      timeout: 60000,
      max_memory: 256,
    },
  };
}

export function getAutomationConfigDefaults(): AutomationConfig {
  return {
    cron: {
      enabled: true,
      jobs: [],
    },
    workflow: {
      enabled: true,
      workflows: [],
    },
    trigger: {
      enabled: true,
      rules: [],
    },
  };
}

export function getNotificationConfigDefaults(): NotificationConfig {
  return {
    message: {
      enabled: true,
      channels: [],
    },
    webhook: {
      enabled: false,
      url: "",
      headers: {},
    },
    email: {
      enabled: false,
      smtp_host: "",
      smtp_port: 587,
      sender: "",
      password: "",
      recipients: [],
    },
  };
}

export function getRAGConfigDefaults(): RAGConfig {
  return {
    enabled: true,
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimension: 1536,
    },
    chunk: {
      size: 512,
      overlap: 64,
    },
    retrieval: {
      top_k: 5,
      min_score: 0.7,
    },
  };
}

export function getMultimodalConfigDefaults(): MultimodalConfig {
  return {
    vision: {
      enabled: true,
      follow_primary_model: true,
      max_image_bytes: 6291456,
      max_images_per_message: 20,
    },
    video: {
      enabled: true,
      max_video_bytes: 16777216,
      max_duration_seconds: 120,
    },
    screenshot: {
      browser_enabled: true,
      screen_enabled: true,
    },
    media: {
      storage_dir: "",
      ttl_seconds: 120,
      http_port: 42873,
    },
  };
}

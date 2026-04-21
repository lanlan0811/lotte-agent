import { describe, it, expect } from "vitest";
import { LotteConfigSchema, AIConfigSchema, GatewayConfigSchema } from "./schema.js";

describe("LotteConfigSchema", () => {
  it("should provide defaults for empty input", () => {
    const config = LotteConfigSchema.parse({});
    expect(config.app_name).toBe("lotte");
    expect(config.version).toBe("1.0.0");
    expect(config.log_level).toBe("info");
    expect(config.language).toBe("zh-CN");
  });

  it("should accept valid custom config", () => {
    const config = LotteConfigSchema.parse({
      app_name: "custom-lotte",
      version: "2.0.0",
      log_level: "debug",
      language: "en-US",
    });
    expect(config.app_name).toBe("custom-lotte");
    expect(config.version).toBe("2.0.0");
    expect(config.log_level).toBe("debug");
    expect(config.language).toBe("en-US");
  });

  it("should reject invalid log level", () => {
    expect(() => LotteConfigSchema.parse({ log_level: "verbose" })).toThrow();
  });

  it("should provide default module config", () => {
    const config = LotteConfigSchema.parse({});
    expect(config.modules.agent).toBe(true);
    expect(config.modules.gateway).toBe(true);
    expect(config.modules.tools).toBe(true);
    expect(config.modules.mcp).toBe(true);
  });

  it("should accept partial module config", () => {
    const config = LotteConfigSchema.parse({
      modules: { agent: false, mcp: false },
    });
    expect(config.modules.agent).toBe(false);
    expect(config.modules.mcp).toBe(false);
    expect(config.modules.gateway).toBe(true);
  });
});

describe("AIConfigSchema", () => {
  it("should provide defaults for empty input", () => {
    const config = AIConfigSchema.parse({});
    expect(config.default_provider).toBe("openai");
    expect(config.default_model).toBe("gpt-4o");
  });

  it("should accept provider configuration", () => {
    const config = AIConfigSchema.parse({
      default_provider: "openai",
      providers: {
        openai: {
          api_url: "https://api.openai.com/v1",
          api_key: "sk-test",
          models: {
            "gpt-4o": {
              context_window: 128000,
              max_output: 16384,
            },
          },
        },
      },
    });
    expect(config.providers.openai).toBeDefined();
    expect(config.providers.openai.api_url).toBe("https://api.openai.com/v1");
    expect(config.providers.openai.models["gpt-4o"]).toBeDefined();
  });

  it("should accept model aliases", () => {
    const config = AIConfigSchema.parse({
      model_aliases: {
        "fast": "gpt-4o-mini",
        "smart": "gpt-4o",
      },
    });
    expect(config.model_aliases["fast"]).toBe("gpt-4o-mini");
    expect(config.model_aliases["smart"]).toBe("gpt-4o");
  });

  it("should provide default STT config", () => {
    const config = AIConfigSchema.parse({});
    expect(config.stt.provider_type).toBe("disabled");
  });
});

describe("GatewayConfigSchema", () => {
  it("should provide defaults for empty input", () => {
    const config = GatewayConfigSchema.parse({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(10623);
    expect(config.auth.mode).toBe("token");
  });

  it("should accept custom port", () => {
    const config = GatewayConfigSchema.parse({ port: 8080 });
    expect(config.port).toBe(8080);
  });

  it("should reject invalid port", () => {
    expect(() => GatewayConfigSchema.parse({ port: 0 })).toThrow();
    expect(() => GatewayConfigSchema.parse({ port: 70000 })).toThrow();
  });

  it("should accept auth configuration", () => {
    const config = GatewayConfigSchema.parse({
      auth: {
        mode: "password",
        password: "secret123",
      },
    });
    expect(config.auth.mode).toBe("password");
    expect(config.auth.password).toBe("secret123");
  });

  it("should reject invalid auth mode", () => {
    expect(() => GatewayConfigSchema.parse({ auth: { mode: "oauth" } })).toThrow();
  });

  it("should provide default websocket config", () => {
    const config = GatewayConfigSchema.parse({});
    expect(config.websocket.max_connections).toBe(10);
    expect(config.websocket.heartbeat_interval).toBe(30000);
  });
});

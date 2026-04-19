import fs from "node:fs";
import path from "node:path";
import {
  LotteConfigSchema,
  AIConfigSchema,
  GatewayConfigSchema,
  ChannelsConfigSchema,
  MCPConfigSchema,
  SkillsConfigSchema,
  ToolsConfigSchema,
  AutomationConfigSchema,
  NotificationConfigSchema,
  RAGConfigSchema,
  MultimodalConfigSchema,
} from "./schema.js";
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
import {
  getMainConfigDefaults,
  getAIConfigDefaults,
  getGatewayConfigDefaults,
  getChannelsConfigDefaults,
  getMCPConfigDefaults,
  getSkillsConfigDefaults,
  getToolsConfigDefaults,
  getAutomationConfigDefaults,
  getNotificationConfigDefaults,
  getRAGConfigDefaults,
  getMultimodalConfigDefaults,
} from "./defaults.js";
import { type ConfigPaths, resolveAllPaths, ensureDirectories, setFilePermissions } from "./paths.js";
import { logger } from "../utils/logger.js";

type ConfigChangeCallback = (configName: string) => void;

export class ConfigLoader {
  private paths: ConfigPaths;
  private mainConfig: LotteConfig | null = null;
  private aiConfig: AIConfig | null = null;
  private gatewayConfig: GatewayConfig | null = null;
  private channelsConfig: ChannelsConfig | null = null;
  private mcpConfig: MCPConfig | null = null;
  private skillsConfig: SkillsConfig | null = null;
  private toolsConfig: ToolsConfig | null = null;
  private automationConfig: AutomationConfig | null = null;
  private notificationConfig: NotificationConfig | null = null;
  private ragConfig: RAGConfig | null = null;
  private multimodalConfig: MultimodalConfig | null = null;
  private changeCallbacks: ConfigChangeCallback[] = [];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.paths = resolveAllPaths(env);
  }

  async load(): Promise<void> {
    ensureDirectories(this.paths);
    await this.loadAllConfigs();
  }

  getPaths(): ConfigPaths {
    return this.paths;
  }

  getMain(): LotteConfig {
    if (!this.mainConfig) {
      this.mainConfig = this.loadConfigFile(
        this.paths.mainConfig,
        LotteConfigSchema,
        getMainConfigDefaults(),
      );
    }
    return this.mainConfig;
  }

  getAI(): AIConfig {
    if (!this.aiConfig) {
      this.aiConfig = this.loadConfigFile(
        this.paths.aiConfig,
        AIConfigSchema,
        getAIConfigDefaults(),
      );
    }
    return this.aiConfig;
  }

  getGateway(): GatewayConfig {
    if (!this.gatewayConfig) {
      this.gatewayConfig = this.loadConfigFile(
        this.paths.gatewayConfig,
        GatewayConfigSchema,
        getGatewayConfigDefaults(),
      );
    }
    return this.gatewayConfig;
  }

  getChannels(): ChannelsConfig {
    if (!this.channelsConfig) {
      this.channelsConfig = this.loadConfigFile(
        this.paths.channelsConfig,
        ChannelsConfigSchema,
        getChannelsConfigDefaults(),
      );
    }
    return this.channelsConfig;
  }

  getMCP(): MCPConfig {
    if (!this.mcpConfig) {
      this.mcpConfig = this.loadConfigFile(
        this.paths.mcpConfig,
        MCPConfigSchema,
        getMCPConfigDefaults(),
      );
    }
    return this.mcpConfig;
  }

  getSkills(): SkillsConfig {
    if (!this.skillsConfig) {
      this.skillsConfig = this.loadConfigFile(
        this.paths.skillsConfig,
        SkillsConfigSchema,
        getSkillsConfigDefaults(),
      );
    }
    return this.skillsConfig;
  }

  getTools(): ToolsConfig {
    if (!this.toolsConfig) {
      this.toolsConfig = this.loadConfigFile(
        this.paths.toolsConfig,
        ToolsConfigSchema,
        getToolsConfigDefaults(),
      );
    }
    return this.toolsConfig;
  }

  getAutomation(): AutomationConfig {
    if (!this.automationConfig) {
      this.automationConfig = this.loadConfigFile(
        this.paths.automationConfig,
        AutomationConfigSchema,
        getAutomationConfigDefaults(),
      );
    }
    return this.automationConfig;
  }

  getNotification(): NotificationConfig {
    if (!this.notificationConfig) {
      this.notificationConfig = this.loadConfigFile(
        this.paths.notificationConfig,
        NotificationConfigSchema,
        getNotificationConfigDefaults(),
      );
    }
    return this.notificationConfig;
  }

  getRAG(): RAGConfig {
    if (!this.ragConfig) {
      this.ragConfig = this.loadConfigFile(
        this.paths.ragConfig,
        RAGConfigSchema,
        getRAGConfigDefaults(),
      );
    }
    return this.ragConfig;
  }

  getMultimodal(): MultimodalConfig {
    if (!this.multimodalConfig) {
      this.multimodalConfig = this.loadConfigFile(
        this.paths.multimodalConfig,
        MultimodalConfigSchema,
        getMultimodalConfigDefaults(),
      );
    }
    return this.multimodalConfig;
  }

  async saveMain(config: LotteConfig): Promise<void> {
    this.mainConfig = config;
    await this.saveConfigFile(this.paths.mainConfig, config);
    this.notifyChange("main");
  }

  async saveAI(config: AIConfig): Promise<void> {
    this.aiConfig = config;
    await this.saveConfigFile(this.paths.aiConfig, config);
    this.notifyChange("ai");
  }

  async saveGateway(config: GatewayConfig): Promise<void> {
    this.gatewayConfig = config;
    await this.saveConfigFile(this.paths.gatewayConfig, config);
    this.notifyChange("gateway");
  }

  async saveChannels(config: ChannelsConfig): Promise<void> {
    this.channelsConfig = config;
    await this.saveConfigFile(this.paths.channelsConfig, config);
    this.notifyChange("channels");
  }

  async saveMCP(config: MCPConfig): Promise<void> {
    this.mcpConfig = config;
    await this.saveConfigFile(this.paths.mcpConfig, config);
    this.notifyChange("mcp");
  }

  async saveSkills(config: SkillsConfig): Promise<void> {
    this.skillsConfig = config;
    await this.saveConfigFile(this.paths.skillsConfig, config);
    this.notifyChange("skills");
  }

  async saveTools(config: ToolsConfig): Promise<void> {
    this.toolsConfig = config;
    await this.saveConfigFile(this.paths.toolsConfig, config);
    this.notifyChange("tools");
  }

  async saveAutomation(config: AutomationConfig): Promise<void> {
    this.automationConfig = config;
    await this.saveConfigFile(this.paths.automationConfig, config);
    this.notifyChange("automation");
  }

  async saveNotification(config: NotificationConfig): Promise<void> {
    this.notificationConfig = config;
    await this.saveConfigFile(this.paths.notificationConfig, config);
    this.notifyChange("notification");
  }

  async saveRAG(config: RAGConfig): Promise<void> {
    this.ragConfig = config;
    await this.saveConfigFile(this.paths.ragConfig, config);
    this.notifyChange("rag");
  }

  async saveMultimodal(config: MultimodalConfig): Promise<void> {
    this.multimodalConfig = config;
    await this.saveConfigFile(this.paths.multimodalConfig, config);
    this.notifyChange("multimodal");
  }

  async saveModule(module: string, data: Record<string, unknown>): Promise<void> {
    switch (module) {
      case "main":
        await this.saveMain({ ...this.getMain(), ...data } as LotteConfig);
        break;
      case "ai":
        await this.saveAI({ ...this.getAI(), ...data } as AIConfig);
        break;
      case "gateway":
        await this.saveGateway({ ...this.getGateway(), ...data } as GatewayConfig);
        break;
      case "channels":
        await this.saveChannels({ ...this.getChannels(), ...data } as ChannelsConfig);
        break;
      case "mcp":
        await this.saveMCP({ ...this.getMCP(), ...data } as MCPConfig);
        break;
      case "skills":
        await this.saveSkills({ ...this.getSkills(), ...data } as SkillsConfig);
        break;
      case "tools":
        await this.saveTools({ ...this.getTools(), ...data } as ToolsConfig);
        break;
      case "automation":
        await this.saveAutomation({ ...this.getAutomation(), ...data } as AutomationConfig);
        break;
      case "notification":
        await this.saveNotification({ ...this.getNotification(), ...data } as NotificationConfig);
        break;
      case "rag":
        await this.saveRAG({ ...this.getRAG(), ...data } as RAGConfig);
        break;
      case "multimodal":
        await this.saveMultimodal({ ...this.getMultimodal(), ...data } as MultimodalConfig);
        break;
      default:
        throw new Error(`Unknown config module: ${module}`);
    }
  }

  onChange(callback: ConfigChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  reloadConfig(configName: string): void {
    switch (configName) {
      case "main":
        this.mainConfig = null;
        break;
      case "ai":
        this.aiConfig = null;
        break;
      case "gateway":
        this.gatewayConfig = null;
        break;
      case "channels":
        this.channelsConfig = null;
        break;
      case "mcp":
        this.mcpConfig = null;
        break;
      case "skills":
        this.skillsConfig = null;
        break;
      case "tools":
        this.toolsConfig = null;
        break;
      case "automation":
        this.automationConfig = null;
        break;
      case "notification":
        this.notificationConfig = null;
        break;
      case "rag":
        this.ragConfig = null;
        break;
      case "multimodal":
        this.multimodalConfig = null;
        break;
    }
    logger.info(`Config reloaded: ${configName}`);
  }

  reloadAll(): void {
    this.mainConfig = null;
    this.aiConfig = null;
    this.gatewayConfig = null;
    this.channelsConfig = null;
    this.mcpConfig = null;
    this.skillsConfig = null;
    this.toolsConfig = null;
    this.automationConfig = null;
    this.notificationConfig = null;
    this.ragConfig = null;
    this.multimodalConfig = null;
    logger.info("All configs reloaded");
  }

  private async loadAllConfigs(): Promise<void> {
    this.mainConfig = this.loadConfigFile(
      this.paths.mainConfig,
      LotteConfigSchema,
      getMainConfigDefaults(),
    );
    this.aiConfig = this.loadConfigFile(
      this.paths.aiConfig,
      AIConfigSchema,
      getAIConfigDefaults(),
    );
    this.gatewayConfig = this.loadConfigFile(
      this.paths.gatewayConfig,
      GatewayConfigSchema,
      getGatewayConfigDefaults(),
    );
    this.channelsConfig = this.loadConfigFile(
      this.paths.channelsConfig,
      ChannelsConfigSchema,
      getChannelsConfigDefaults(),
    );
    this.mcpConfig = this.loadConfigFile(
      this.paths.mcpConfig,
      MCPConfigSchema,
      getMCPConfigDefaults(),
    );
    this.skillsConfig = this.loadConfigFile(
      this.paths.skillsConfig,
      SkillsConfigSchema,
      getSkillsConfigDefaults(),
    );
    this.toolsConfig = this.loadConfigFile(
      this.paths.toolsConfig,
      ToolsConfigSchema,
      getToolsConfigDefaults(),
    );
    this.automationConfig = this.loadConfigFile(
      this.paths.automationConfig,
      AutomationConfigSchema,
      getAutomationConfigDefaults(),
    );
    this.notificationConfig = this.loadConfigFile(
      this.paths.notificationConfig,
      NotificationConfigSchema,
      getNotificationConfigDefaults(),
    );
    this.ragConfig = this.loadConfigFile(
      this.paths.ragConfig,
      RAGConfigSchema,
      getRAGConfigDefaults(),
    );
    this.multimodalConfig = this.loadConfigFile(
      this.paths.multimodalConfig,
      MultimodalConfigSchema,
      getMultimodalConfigDefaults(),
    );
  }

  private loadConfigFile<T>(
    filePath: string,
    schema: { parse: (data: unknown) => T },
    defaults: T,
  ): T {
    if (!fs.existsSync(filePath)) {
      this.saveConfigFileSync(filePath, defaults);
      return defaults;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return schema.parse(parsed);
    } catch (error) {
      logger.warn(`Failed to load config from ${filePath}, using defaults`, error);
      return defaults;
    }
  }

  private async saveConfigFile<T>(filePath: string, config: T): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const json = JSON.stringify(config, null, 2) + "\n";
    fs.writeFileSync(filePath, json, "utf-8");
    setFilePermissions(filePath, 0o600);
  }

  private saveConfigFileSync<T>(filePath: string, config: T): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const json = JSON.stringify(config, null, 2) + "\n";
    fs.writeFileSync(filePath, json, "utf-8");
    setFilePermissions(filePath, 0o600);
  }

  private notifyChange(configName: string): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(configName);
      } catch (error) {
        logger.error(`Config change callback error for ${configName}`, error);
      }
    }
  }
}

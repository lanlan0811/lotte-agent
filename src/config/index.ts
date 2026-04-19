export { ConfigLoader } from "./loader.js";
export { ConfigWatcher } from "./watcher.js";
export { TemplateGenerator } from "./templates.js";
export { resolveAllPaths, ensureDirectories, setFilePermissions } from "./paths.js";
export type { ConfigPaths } from "./paths.js";
export {
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
export type {
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
export {
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

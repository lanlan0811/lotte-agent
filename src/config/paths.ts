import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../utils/logger.js";

const STATE_DIRNAME = ".lotte";
const CONFIG_FILENAME = "lotte.json";
const AI_CONFIG_FILENAME = "ai.json";
const GATEWAY_CONFIG_FILENAME = "gateway.json";
const CHANNELS_CONFIG_FILENAME = "channels.json";
const MCP_CONFIG_FILENAME = "mcp.json";
const SKILLS_CONFIG_FILENAME = "skills.json";
const TOOLS_CONFIG_FILENAME = "tools.json";
const AUTOMATION_CONFIG_FILENAME = "automation.json";
const NOTIFICATION_CONFIG_FILENAME = "notification.json";
const RAG_CONFIG_FILENAME = "rag.json";
const MULTIMODAL_CONFIG_FILENAME = "multimodal.json";
const VOICE_CONFIG_FILENAME = "voice.json";

export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.LOTTE_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, env);
  }
  return path.join(os.homedir(), STATE_DIRNAME);
}

export function resolveUserPath(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (env.LOTTE_STATE_DIR && input.startsWith("${LOTTE_STATE_DIR}")) {
    return path.join(resolveStateDir(env), input.slice("${LOTTE_STATE_DIR}".length));
  }
  return path.resolve(input);
}

export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env);
  const configDir = path.join(stateDir, "config");
  return configDir;
}

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env);
  const dataDir = path.join(stateDir, "data");
  return dataDir;
}

export interface ConfigPaths {
  stateDir: string;
  configDir: string;
  dataDir: string;
  dbPath: string;
  mainConfig: string;
  aiConfig: string;
  gatewayConfig: string;
  channelsConfig: string;
  mcpConfig: string;
  skillsConfig: string;
  toolsConfig: string;
  automationConfig: string;
  notificationConfig: string;
  ragConfig: string;
  multimodalConfig: string;
  voiceConfig: string;
  soulDir: string;
  memoryDir: string;
  mediaDir: string;
  dumpsDir: string;
  logsDir: string;
}

export function resolveAllPaths(env: NodeJS.ProcessEnv = process.env): ConfigPaths {
  const stateDir = resolveStateDir(env);
  const configDir = resolveConfigDir(env);
  const dataDir = resolveDataDir(env);

  return {
    stateDir,
    configDir,
    dataDir,
    dbPath: path.join(dataDir, "lotte.db"),
    mainConfig: path.join(configDir, CONFIG_FILENAME),
    aiConfig: path.join(configDir, AI_CONFIG_FILENAME),
    gatewayConfig: path.join(configDir, GATEWAY_CONFIG_FILENAME),
    channelsConfig: path.join(configDir, CHANNELS_CONFIG_FILENAME),
    mcpConfig: path.join(configDir, MCP_CONFIG_FILENAME),
    skillsConfig: path.join(configDir, SKILLS_CONFIG_FILENAME),
    toolsConfig: path.join(configDir, TOOLS_CONFIG_FILENAME),
    automationConfig: path.join(configDir, AUTOMATION_CONFIG_FILENAME),
    notificationConfig: path.join(configDir, NOTIFICATION_CONFIG_FILENAME),
    ragConfig: path.join(configDir, RAG_CONFIG_FILENAME),
    multimodalConfig: path.join(configDir, MULTIMODAL_CONFIG_FILENAME),
    voiceConfig: path.join(configDir, VOICE_CONFIG_FILENAME),
    soulDir: path.join(stateDir, "soul"),
    memoryDir: path.join(stateDir, "memory"),
    mediaDir: path.join(dataDir, "media"),
    dumpsDir: path.join(stateDir, "dumps"),
    logsDir: path.join(stateDir, "logs"),
  };
}

export function ensureDirectories(paths: ConfigPaths): void {
  const dirs = [
    paths.stateDir,
    paths.configDir,
    paths.dataDir,
    paths.soulDir,
    paths.memoryDir,
    paths.mediaDir,
    paths.dumpsDir,
    paths.logsDir,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  const dbDir = path.dirname(paths.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }
}

export function setFilePermissions(filePath: string, mode: number): void {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    logger.debug(`Failed to set file permissions: ${filePath}`);
  }
}

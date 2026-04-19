import { SoulLoader } from "./soul-loader.js";
import { logger } from "../utils/logger.js";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

export interface PromptBuilderOptions {
  soulDir: string;
  enabledFiles?: string[];
  agentId?: string;
  heartbeatEnabled?: boolean;
}

const DEFAULT_ENABLED_FILES = ["AGENTS.md", "SOUL.md", "PROFILE.md"];

const HEARTBEAT_PATTERN = /<!-- heartbeat:start -->.*?<!-- heartbeat:end -->/gs;

export class PromptBuilder {
  private soulLoader: SoulLoader;
  private enabledFiles: string[];
  private agentId?: string;
  private heartbeatEnabled: boolean;

  constructor(options: PromptBuilderOptions) {
    this.soulLoader = new SoulLoader(options.soulDir);
    this.enabledFiles = options.enabledFiles ?? DEFAULT_ENABLED_FILES;
    this.agentId = options.agentId;
    this.heartbeatEnabled = options.heartbeatEnabled ?? false;
  }

  build(): string {
    const parts: string[] = [];

    for (const filename of this.enabledFiles) {
      const content = this.soulLoader.loadCustom(filename);
      if (!content) {
        logger.debug(`Soul file empty or missing: ${filename}`);
        continue;
      }

      const processed = this.processContent(filename, content);
      if (processed) {
        parts.push(`# ${filename}\n\n${processed}`);
      }
    }

    if (this.agentId) {
      parts.unshift(`Agent ID: ${this.agentId}`);
    }

    if (parts.length === 0) {
      logger.warn("No soul content loaded, using default prompt");
      return DEFAULT_SYSTEM_PROMPT;
    }

    const prompt = parts.join("\n\n");
    logger.debug(`System prompt built, total length: ${prompt.length} chars`);
    return prompt;
  }

  buildWithMemory(memorySummary?: string): string {
    const basePrompt = this.build();

    if (!memorySummary) return basePrompt;

    const memorySection = `# MEMORY\n\n${memorySummary}`;
    return `${basePrompt}\n\n${memorySection}`;
  }

  getSoulLoader(): SoulLoader {
    return this.soulLoader;
  }

  private processContent(filename: string, content: string): string {
    if (filename === "AGENTS.md") {
      return this.processHeartbeatSection(content);
    }
    return content;
  }

  private processHeartbeatSection(content: string): string {
    if (!content.includes("<!-- heartbeat:start -->")) {
      return content;
    }

    if (this.heartbeatEnabled) {
      return content
        .replace(/<!-- heartbeat:start -->/g, "")
        .replace(/<!-- heartbeat:end -->/g, "")
        .trim();
    }

    return content.replace(HEARTBEAT_PATTERN, "").trim();
  }
}

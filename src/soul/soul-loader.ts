import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

export interface SoulConfig {
  name: string;
  emoji: string;
  bio: string;
  traits: string[];
  communication_style: string;
  decision_framework: string;
  core_principles: string[];
}

export interface ProfileConfig {
  user_name: string;
  preferences: Record<string, string>;
  communication_preferences: string;
  interests: string[];
}

export interface AgentRule {
  name: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface AgentWorkflow {
  name: string;
  trigger: string;
  steps: string[];
}

export interface AgentsConfig {
  rules: AgentRule[];
  workflows: AgentWorkflow[];
  tools_enabled: string[];
  tools_disabled: string[];
  custom_instructions: string;
}

export class SoulLoader {
  private soulDir: string;
  private cache: Map<string, string> = new Map();
  private lastModified: Map<string, number> = new Map();

  constructor(soulDir: string) {
    this.soulDir = soulDir;
  }

  loadSoul(): string {
    return this.loadMarkdownFile("SOUL.md");
  }

  loadProfile(): string {
    return this.loadMarkdownFile("PROFILE.md");
  }

  loadAgents(): string {
    return this.loadMarkdownFile("AGENTS.md");
  }

  loadMemory(): string {
    return this.loadMarkdownFile("MEMORY.md");
  }

  loadCustom(filename: string): string {
    if (!filename.endsWith(".md")) {
      filename += ".md";
    }
    return this.loadMarkdownFile(filename);
  }

  listFiles(): string[] {
    try {
      if (!fs.existsSync(this.soulDir)) return [];
      return fs
        .readdirSync(this.soulDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
    } catch {
      logger.debug("Soul loader: failed to list soul files");
      return [];
    }
  }

  writeFile(filename: string, content: string): void {
    if (!filename.endsWith(".md")) {
      filename += ".md";
    }
    const filePath = path.join(this.soulDir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    this.cache.delete(filename);
    this.lastModified.delete(filename);
    logger.debug(`Soul file written: ${filename}`);
  }

  private loadMarkdownFile(filename: string): string {
    const filePath = path.join(this.soulDir, filename);

    try {
      const stat = fs.statSync(filePath);
      const mtime = stat.mtimeMs;

      if (this.cache.has(filename) && this.lastModified.get(filename) === mtime) {
        return this.cache.get(filename)!;
      }

      let content = fs.readFileSync(filePath, "utf-8").trim();

      content = this.stripFrontmatter(content);

      this.cache.set(filename, content);
      this.lastModified.set(filename, mtime);

      logger.debug(`Loaded soul file: ${filename}`);
      return content;
    } catch {
      logger.debug(`Soul file not found or unreadable: ${filename}`);
      return "";
    }
  }

  private stripFrontmatter(content: string): string {
    if (!content.startsWith("---")) return content;
    const parts = content.split("---");
    if (parts.length >= 3) {
      return parts.slice(2).join("---").trim();
    }
    return content;
  }

  clearCache(): void {
    this.cache.clear();
    this.lastModified.clear();
  }
}

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SkillManifest, SkillPoolManifest } from "./types.js";
import { logger } from "../utils/logger.js";

const POOL_DIR_NAME = "skill_pool";
const MANIFEST_FILE = "manifest.json";
const SKILL_FILE = "SKILL.md";
const TEMP_SUFFIX = ".tmp";

export class SkillManager {
  private poolDir: string;
  private manifestPath: string;
  private manifest: SkillPoolManifest;

  constructor(options: { dataDir: string; configDir: string }) {
    this.poolDir = join(options.dataDir, POOL_DIR_NAME);
    this.manifestPath = join(this.poolDir, MANIFEST_FILE);

    this.manifest = {
      schema_version: "skill-manifest.v1",
      version: 0,
      skills: {},
    };
  }

  initialize(): void {
    if (!existsSync(this.poolDir)) {
      mkdirSync(this.poolDir, { recursive: true });
    }

    this.manifest = this.loadManifest();
    this.reconcileManifest();
    this.saveManifest();

    logger.info(`Skill manager initialized (${Object.keys(this.manifest.skills).length} skills)`);
  }

  shutdown(): void {
    this.saveManifest();
    logger.info("Skill manager shutdown");
  }

  listSkills(): SkillManifest[] {
    return Object.values(this.manifest.skills);
  }

  getSkill(name: string): SkillManifest | undefined {
    return this.manifest.skills[name];
  }

  addSkill(skill: Omit<SkillManifest, "createdAt" | "updatedAt" | "signature">): SkillManifest {
    const now = Date.now();
    const manifest: SkillManifest = {
      ...skill,
      createdAt: now,
      updatedAt: now,
      signature: this.computeSignature(skill.content),
    };

    const skillDir = join(this.poolDir, skill.name);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    writeFileSync(join(skillDir, SKILL_FILE), skill.content, "utf-8");

    if (skill.references && Object.keys(skill.references).length > 0) {
      const refsDir = join(skillDir, "references");
      if (!existsSync(refsDir)) {
        mkdirSync(refsDir, { recursive: true });
      }
      this.writeTreeAtomic(refsDir, skill.references);
    }

    if (skill.scripts && Object.keys(skill.scripts).length > 0) {
      const scriptsDir = join(skillDir, "scripts");
      if (!existsSync(scriptsDir)) {
        mkdirSync(scriptsDir, { recursive: true });
      }
      this.writeTreeAtomic(scriptsDir, skill.scripts);
    }

    this.manifest.skills[skill.name] = manifest;
    this.saveManifest();

    logger.info(`Skill added: ${skill.name}`);
    return manifest;
  }

  updateSkill(name: string, updates: Partial<Pick<SkillManifest, "description" | "content" | "enabled" | "tags" | "references" | "scripts">>): SkillManifest | null {
    const existing = this.manifest.skills[name];
    if (!existing) return null;

    const updated: SkillManifest = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    if (updates.content) {
      updated.signature = this.computeSignature(updates.content);
      const skillDir = join(this.poolDir, name);
      this.atomicWriteFile(join(skillDir, SKILL_FILE), updates.content);
    }

    this.manifest.skills[name] = updated;
    this.saveManifest();

    logger.info(`Skill updated: ${name}`);
    return updated;
  }

  removeSkill(name: string): boolean {
    if (!this.manifest.skills[name]) return false;

    delete this.manifest.skills[name];
    this.saveManifest();

    const skillDir = join(this.poolDir, name);
    if (existsSync(skillDir)) {
      try {
        const { rmSync } = require("node:fs");
        rmSync(skillDir, { recursive: true, force: true });
      } catch {
        logger.debug(`Failed to remove skill directory: ${skillDir}`);
      }
    }

    logger.info(`Skill removed: ${name}`);
    return true;
  }

  toggleSkill(name: string): SkillManifest | null {
    const skill = this.manifest.skills[name];
    if (!skill) return null;

    skill.enabled = !skill.enabled;
    skill.updatedAt = Date.now();
    this.saveManifest();

    logger.info(`Skill toggled: ${name} (enabled=${skill.enabled})`);
    return skill;
  }

  getEnabledSkills(): SkillManifest[] {
    return Object.values(this.manifest.skills).filter((s) => s.enabled);
  }

  getSkillsBySource(source: SkillManifest["source"]): SkillManifest[] {
    return Object.values(this.manifest.skills).filter((s) => s.source === source);
  }

  getManifest(): SkillPoolManifest {
    return { ...this.manifest };
  }

  getPoolDir(): string {
    return this.poolDir;
  }

  private loadManifest(): SkillPoolManifest {
    if (!existsSync(this.manifestPath)) {
      return {
        schema_version: "skill-manifest.v1",
        version: 0,
        skills: {},
      };
    }

    try {
      const data = readFileSync(this.manifestPath, "utf-8");
      return JSON.parse(data) as SkillPoolManifest;
    } catch {
      logger.warn("Failed to load skill manifest, creating new one");
      return {
        schema_version: "skill-manifest.v1",
        version: 0,
        skills: {},
      };
    }
  }

  private saveManifest(): void {
    this.manifest.version++;
    const data = JSON.stringify(this.manifest, null, 2);
    this.atomicWriteFile(this.manifestPath, data);
  }

  private atomicWriteFile(filePath: string, data: string): void {
    const tempPath = filePath + TEMP_SUFFIX;
    writeFileSync(tempPath, data, "utf-8");

    try {
      renameSync(tempPath, filePath);
    } catch (error) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private reconcileManifest(): void {
    const diskSkills = this.discoverDiskSkills();

    for (const [name, skillData] of diskSkills) {
      if (!this.manifest.skills[name]) {
        this.manifest.skills[name] = {
          name,
          version: "0.1.0",
          description: "",
          enabled: true,
          source: "local",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          content: skillData.content,
          references: skillData.references,
          scripts: skillData.scripts,
          signature: this.computeSignature(skillData.content),
        };
      } else {
        const existing = this.manifest.skills[name];
        const diskSignature = this.computeSignature(skillData.content);
        if (existing.signature !== diskSignature) {
          existing.content = skillData.content;
          existing.references = skillData.references;
          existing.scripts = skillData.scripts;
          existing.signature = diskSignature;
          existing.updatedAt = Date.now();
        }
      }
    }

    for (const name of Object.keys(this.manifest.skills)) {
      if (!diskSkills.has(name)) {
        const skillDir = join(this.poolDir, name);
        if (!existsSync(skillDir)) {
          delete this.manifest.skills[name];
        }
      }
    }
  }

  private discoverDiskSkills(): Map<string, { content: string; references: Record<string, unknown>; scripts: Record<string, unknown> }> {
    const result = new Map<string, { content: string; references: Record<string, unknown>; scripts: Record<string, unknown> }>();

    if (!existsSync(this.poolDir)) return result;

    const entries = readdirSync(this.poolDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(this.poolDir, entry.name);
      const skillFile = join(skillDir, SKILL_FILE);

      if (!existsSync(skillFile)) continue;

      try {
        const content = readFileSync(skillFile, "utf-8");
        const references = this.readTree(join(skillDir, "references"));
        const scripts = this.readTree(join(skillDir, "scripts"));

        result.set(entry.name, { content, references, scripts });
      } catch {
        logger.debug(`Failed to read skill: ${entry.name}`);
      }
    }

    return result;
  }

  private computeSignature(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private readTree(dir: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!existsSync(dir)) return result;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          result[entry.name] = this.readTree(fullPath);
        } else if (entry.isFile()) {
          result[entry.name] = readFileSync(fullPath, "utf-8");
        }
      }
    } catch {
      // Ignore read errors
    }

    return result;
  }

  private writeTreeAtomic(dir: string, tree: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(tree)) {
      const fullPath = join(dir, key);
      if (typeof value === "string") {
        this.atomicWriteFile(fullPath, value);
      } else if (typeof value === "object" && value !== null) {
        if (!existsSync(fullPath)) {
          mkdirSync(fullPath, { recursive: true });
        }
        this.writeTreeAtomic(fullPath, value as Record<string, unknown>);
      }
    }
  }
}

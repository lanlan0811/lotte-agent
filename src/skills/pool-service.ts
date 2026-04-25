import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { SkillManifest, SkillPoolManifest } from "./types.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

const TEMP_SUFFIX = ".tmp";
const LOCK_SUFFIX = ".lock";
const LOCK_STALE_MS = 30_000;
const MANIFEST_FILE = "manifest.json";
const SKILL_FILE = "SKILL.md";

export interface PoolServiceOptions {
  poolDir: string;
  lockTimeout?: number;
}

export interface SkillTransferResult {
  name: string;
  transferred: boolean;
  error?: string;
}

export interface PoolSyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  conflicts: string[];
  errors: Array<{ name: string; error: string }>;
}

class FileLock {
  private lockPath: string;
  private timeout: number;
  private acquired = false;

  constructor(filePath: string, timeout: number) {
    this.lockPath = filePath + LOCK_SUFFIX;
    this.timeout = timeout;
  }

  async acquire(): Promise<boolean> {
    const deadline = Date.now() + this.timeout;

    while (Date.now() < deadline) {
      if (!existsSync(this.lockPath)) {
        try {
          writeFileSync(this.lockPath, `${process.pid}\n${Date.now()}\n`, "utf-8");
          this.acquired = true;
          return true;
        } catch {
          logger.debug("Lock file race condition, retrying");
        }
      } else {
        try {
          const content = readFileSync(this.lockPath, "utf-8").trim().split("\n");
          const lockTime = parseInt(content[1] ?? "0", 10);
          if (Date.now() - lockTime > LOCK_STALE_MS) {
            unlinkSync(this.lockPath);
            continue;
          }
        } catch {
          logger.debug("Lock file removed between check and read, retrying");
          continue;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return false;
  }

  release(): void {
    if (!this.acquired) return;

    try {
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    } catch {
      logger.debug("Lock release failed");
    }
    this.acquired = false;
  }
}

export class SkillPoolService {
  private poolDir: string;
  private manifestPath: string;
  private manifest: SkillPoolManifest;
  private lockTimeout: number;

  constructor(options: PoolServiceOptions) {
    this.poolDir = resolve(options.poolDir);
    this.manifestPath = join(this.poolDir, MANIFEST_FILE);
    this.lockTimeout = options.lockTimeout ?? 10_000;
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
    this.saveManifestAtomic();

    logger.info(`Skill pool service initialized (${Object.keys(this.manifest.skills).length} skills in pool)`);
  }

  getPoolDir(): string {
    return this.poolDir;
  }

  getManifest(): SkillPoolManifest {
    return { ...this.manifest, skills: { ...this.manifest.skills } };
  }

  listSkills(): SkillManifest[] {
    return Object.values(this.manifest.skills);
  }

  getSkill(name: string): SkillManifest | undefined {
    return this.manifest.skills[name];
  }

  async addSkillToPool(skill: Omit<SkillManifest, "createdAt" | "updatedAt" | "signature">): Promise<SkillManifest> {
    const lock = new FileLock(this.manifestPath, this.lockTimeout);
    const acquired = await lock.acquire();

    if (!acquired) {
      throw new Error(`Failed to acquire lock for skill pool when adding '${skill.name}'`);
    }

    try {
      this.manifest = this.loadManifest();

      if (this.manifest.skills[skill.name]) {
        throw new Error(`Skill '${skill.name}' already exists in pool`);
      }

      const now = Date.now();
      const manifest: SkillManifest = {
        ...skill,
        createdAt: now,
        updatedAt: now,
        signature: this.computeSignature(skill.content),
      };

      this.writeSkillToDisk(manifest);
      this.manifest.skills[skill.name] = manifest;
      this.saveManifestAtomic();

      logger.info(`Skill added to pool: ${skill.name}`);
      return manifest;
    } finally {
      lock.release();
    }
  }

  async updateSkillInPool(name: string, updates: Partial<Pick<SkillManifest, "description" | "content" | "enabled" | "tags" | "references" | "scripts">>): Promise<SkillManifest | null> {
    const lock = new FileLock(this.manifestPath, this.lockTimeout);
    const acquired = await lock.acquire();

    if (!acquired) {
      throw new Error(`Failed to acquire lock for skill pool when updating '${name}'`);
    }

    try {
      this.manifest = this.loadManifest();

      const existing = this.manifest.skills[name];
      if (!existing) return null;

      const updated: SkillManifest = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };

      if (updates.content) {
        updated.signature = this.computeSignature(updates.content);
      }

      this.writeSkillToDisk(updated);
      this.manifest.skills[name] = updated;
      this.saveManifestAtomic();

      logger.info(`Skill updated in pool: ${name}`);
      return updated;
    } finally {
      lock.release();
    }
  }

  async removeSkillFromPool(name: string): Promise<boolean> {
    const lock = new FileLock(this.manifestPath, this.lockTimeout);
    const acquired = await lock.acquire();

    if (!acquired) {
      throw new Error(`Failed to acquire lock for skill pool when removing '${name}'`);
    }

    try {
      this.manifest = this.loadManifest();

      if (!this.manifest.skills[name]) return false;

      delete this.manifest.skills[name];
      this.saveManifestAtomic();

      const skillDir = join(this.poolDir, name);
      this.removeDirSafe(skillDir);

      logger.info(`Skill removed from pool: ${name}`);
      return true;
    } finally {
      lock.release();
    }
  }

  transferToWorkspace(skillName: string, workspaceDir: string): SkillTransferResult {
    const skill = this.manifest.skills[skillName];
    if (!skill) {
      return { name: skillName, transferred: false, error: `Skill '${skillName}' not found in pool` };
    }

    const targetDir = join(workspaceDir, skillName);
    const sourceDir = join(this.poolDir, skillName);

    try {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      this.copyDirAtomic(sourceDir, targetDir);

      const targetSkillFile = join(targetDir, SKILL_FILE);
      if (!existsSync(targetSkillFile)) {
        writeFileSync(targetSkillFile, skill.content, "utf-8");
      }

      logger.info(`Skill '${skillName}' transferred to workspace: ${workspaceDir}`);
      return { name: skillName, transferred: true };
    } catch (error) {
      const msg = formatErrorMessage(error);
      logger.error(`Failed to transfer skill '${skillName}' to workspace: ${msg}`);
      return { name: skillName, transferred: false, error: msg };
    }
  }

  transferFromWorkspace(skillName: string, workspaceDir: string): SkillTransferResult {
    const sourceDir = join(workspaceDir, skillName);
    const skillFile = join(sourceDir, SKILL_FILE);

    if (!existsSync(skillFile)) {
      return { name: skillName, transferred: false, error: `Skill file not found in workspace: ${skillFile}` };
    }

    try {
      const content = readFileSync(skillFile, "utf-8");
      const references = this.readTree(join(sourceDir, "references"));
      const scripts = this.readTree(join(sourceDir, "scripts"));

      const existing = this.manifest.skills[skillName];
      const now = Date.now();

      const manifest: SkillManifest = existing
        ? {
            ...existing,
            content,
            references,
            scripts,
            signature: this.computeSignature(content),
            updatedAt: now,
          }
        : {
            name: skillName,
            version: "0.1.0",
            description: `Skill imported from workspace`,
            enabled: true,
            source: "local" as const,
            createdAt: now,
            updatedAt: now,
            content,
            references,
            scripts,
            signature: this.computeSignature(content),
          };

      this.writeSkillToDisk(manifest);
      this.manifest.skills[skillName] = manifest;
      this.saveManifestAtomic();

      logger.info(`Skill '${skillName}' transferred from workspace: ${workspaceDir}`);
      return { name: skillName, transferred: true };
    } catch (error) {
      const msg = formatErrorMessage(error);
      logger.error(`Failed to transfer skill '${skillName}' from workspace: ${msg}`);
      return { name: skillName, transferred: false, error: msg };
    }
  }

  syncFromWorkspace(workspaceDir: string): PoolSyncResult {
    const result: PoolSyncResult = {
      added: [],
      updated: [],
      removed: [],
      conflicts: [],
      errors: [],
    };

    if (!existsSync(workspaceDir)) {
      logger.warn(`Workspace directory does not exist: ${workspaceDir}`);
      return result;
    }

    const workspaceSkills = this.discoverSkillsInDir(workspaceDir);
    const poolSkillNames = new Set(Object.keys(this.manifest.skills));
    const workspaceSkillNames = new Set(workspaceSkills.keys());

    for (const [name, skillData] of workspaceSkills) {
      const diskSignature = this.computeSignature(skillData.content);

      if (!poolSkillNames.has(name)) {
        try {
          const now = Date.now();
          const manifest: SkillManifest = {
            name,
            version: "0.1.0",
            description: "",
            enabled: true,
            source: "local",
            createdAt: now,
            updatedAt: now,
            content: skillData.content,
            references: skillData.references,
            scripts: skillData.scripts,
            signature: diskSignature,
          };

          this.writeSkillToDisk(manifest);
          this.manifest.skills[name] = manifest;
          result.added.push(name);
        } catch (error) {
          const msg = formatErrorMessage(error);
          result.errors.push({ name, error: msg });
        }
      } else {
        const existing = this.manifest.skills[name];
        if (!existing) continue;
        if (existing.signature !== diskSignature) {
          if (existing.source === "builtin") {
            result.conflicts.push(name);
          } else {
            try {
              existing.content = skillData.content;
              existing.references = skillData.references;
              existing.scripts = skillData.scripts;
              existing.signature = diskSignature;
              existing.updatedAt = Date.now();
              this.writeSkillToDisk(existing);
              result.updated.push(name);
            } catch (error) {
              const msg = formatErrorMessage(error);
              result.errors.push({ name, error: msg });
            }
          }
        }
      }
    }

    for (const name of poolSkillNames) {
      if (!workspaceSkillNames.has(name) && this.manifest.skills[name]?.source !== "builtin") {
        const skillDir = join(this.poolDir, name);
        if (!existsSync(skillDir)) {
          delete this.manifest.skills[name];
          result.removed.push(name);
        }
      }
    }

    if (result.added.length > 0 || result.updated.length > 0 || result.removed.length > 0) {
      this.saveManifestAtomic();
    }

    logger.info(
      `Pool sync from workspace: +${result.added.length} added, ~${result.updated.length} updated, -${result.removed.length} removed, !${result.conflicts.length} conflicts`,
    );

    return result;
  }

  verifyIntegrity(): {
    valid: boolean;
    missingFiles: string[];
    signatureMismatches: string[];
    orphanedDirs: string[];
  } {
    const missingFiles: string[] = [];
    const signatureMismatches: string[] = [];
    const orphanedDirs: string[] = [];

    const diskDirs = new Set<string>();
    if (existsSync(this.poolDir)) {
      const entries = readdirSync(this.poolDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== ".lock") {
          diskDirs.add(entry.name);
        }
      }
    }

    for (const [name, skill] of Object.entries(this.manifest.skills)) {
      const skillDir = join(this.poolDir, name);
      const skillFile = join(skillDir, SKILL_FILE);

      if (!existsSync(skillFile)) {
        missingFiles.push(name);
        continue;
      }

      try {
        const content = readFileSync(skillFile, "utf-8");
        const actualSig = this.computeSignature(content);
        if (actualSig !== skill.signature) {
          signatureMismatches.push(name);
        }
      } catch {
        logger.debug(`Failed to read skill file for signature check: ${name}`);
        missingFiles.push(name);
      }
    }

    for (const dirName of diskDirs) {
      if (!this.manifest.skills[dirName]) {
        orphanedDirs.push(dirName);
      }
    }

    return {
      valid: missingFiles.length === 0 && signatureMismatches.length === 0,
      missingFiles,
      signatureMismatches,
      orphanedDirs,
    };
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
      logger.warn("Failed to load skill pool manifest, creating new one");
      return {
        schema_version: "skill-manifest.v1",
        version: 0,
        skills: {},
      };
    }
  }

  private saveManifestAtomic(): void {
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
        logger.debug("Failed to cleanup temp file during atomic write");
      }
      throw error;
    }
  }

  private writeSkillToDisk(skill: SkillManifest): void {
    const skillDir = join(this.poolDir, skill.name);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    this.atomicWriteFile(join(skillDir, SKILL_FILE), skill.content);

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
  }

  private copyDirAtomic(sourceDir: string, targetDir: string): void {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const entries = readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(sourceDir, entry.name);
      const dstPath = join(targetDir, entry.name);

      if (entry.isDirectory()) {
        this.copyDirAtomic(srcPath, dstPath);
      } else if (entry.isFile()) {
        const content = readFileSync(srcPath, "utf-8");
        this.atomicWriteFile(dstPath, content);
      }
    }
  }

  private removeDirSafe(dir: string): void {
    if (!existsSync(dir)) return;

    try {
      const { rmSync } = require("node:fs") as typeof import("node:fs");
      rmSync(dir, { recursive: true, force: true });
    } catch {
      logger.debug(`Failed to remove directory: ${dir}`);
    }
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
      logger.debug("Failed to read skill directory tree");
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

  private reconcileManifest(): void {
    const diskSkills = this.discoverSkillsInDir(this.poolDir);

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

  private discoverSkillsInDir(dir: string): Map<string, { content: string; references: Record<string, unknown>; scripts: Record<string, unknown> }> {
    const result = new Map<string, { content: string; references: Record<string, unknown>; scripts: Record<string, unknown> }>();

    if (!existsSync(dir)) return result;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(dir, entry.name);
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
}

import type { SkillManager } from "./manager.js";
import { SkillHubClient, SkillConflictError, suggestConflictName } from "./hub.js";
import { SkillScanner } from "./scanner.js";
import { getBuiltinSkillByName } from "./builtins.js";
import type { SkillManifest, SkillInstallResult, ScanResult } from "./types.js";
import { logger } from "../utils/logger.js";

export interface SkillInstallerOptions {
  scanMode: "block" | "warn" | "off";
  hubBaseUrl?: string;
}

export class SkillInstaller {
  private skillManager: SkillManager;
  private hubClient: SkillHubClient;
  private scanner: SkillScanner;
  private scanMode: SkillInstallerOptions["scanMode"];

  constructor(skillManager: SkillManager, options: SkillInstallerOptions) {
    this.skillManager = skillManager;
    this.hubClient = new SkillHubClient({ baseUrl: options.hubBaseUrl });
    this.scanner = new SkillScanner();
    this.scanMode = options.scanMode;
  }

  async installFromHub(slug: string, options?: { version?: string; force?: boolean }): Promise<SkillInstallResult> {
    const existing = this.skillManager.getSkill(slug);
    if (existing && !options?.force) {
      throw new SkillConflictError(`Skill '${slug}' already exists. Use force=true to overwrite.`, slug);
    }

    if (existing && options?.force) {
      this.skillManager.removeSkill(slug);
    }

    const result = await this.hubClient.installFromHub(slug, this.skillManager, {
      version: options?.version,
    });

    logger.info(`Skill installed from hub: ${result.name}`);
    return result;
  }

  installBuiltin(name: string): SkillManifest {
    const definition = getBuiltinSkillByName(name);
    if (!definition) {
      throw new Error(`Unknown builtin skill: ${name}`);
    }

    const existing = this.skillManager.getSkill(name);
    if (existing) {
      throw new SkillConflictError(`Skill '${name}' already exists`, name);
    }

    const manifest = this.skillManager.addSkill({
      name: definition.name,
      version: definition.version,
      description: definition.description,
      enabled: true,
      source: "builtin",
      content: definition.content,
      tags: definition.tags,
      references: {},
      scripts: {},
    });

    logger.info(`Builtin skill installed: ${name}`);
    return manifest;
  }

  scanSkill(skillName: string): ScanResult {
    const skill = this.skillManager.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const poolDir = this.skillManager.getPoolDir();
    const skillDir = `${poolDir}/${skillName}`;

    return this.scanner.scanSkill(skillDir, skillName);
  }

  async installWithScan(slug: string, options?: { version?: string; force?: boolean }): Promise<{
    installResult: SkillInstallResult;
    scanResult: ScanResult | null;
  }> {
    const installResult = await this.installFromHub(slug, options);

    if (this.scanMode === "off") {
      return { installResult, scanResult: null };
    }

    const scanResult = this.scanSkill(installResult.name);

    if (this.scanMode === "block" && !scanResult.isSafe) {
      this.skillManager.removeSkill(installResult.name);
      throw new Error(
        `Skill '${installResult.name}' blocked by security scan. ` +
        `Max severity: ${scanResult.maxSeverity}. ` +
        `Findings: ${scanResult.findings.map((f) => f.message).join("; ")}`,
      );
    }

    if (this.scanMode === "warn" && !scanResult.isSafe) {
      logger.warn(
        `Skill '${installResult.name}' has security findings (max severity: ${scanResult.maxSeverity}): ` +
        scanResult.findings.map((f) => f.message).join("; "),
      );
    }

    return { installResult, scanResult };
  }

  searchHub(query: string, options?: { limit?: number; offset?: number }) {
    return this.hubClient.search(query, options);
  }

  installAllBuiltins(): SkillManifest[] {
    const { getBuiltinSkillNames } = require("./builtins.js") as typeof import("./builtins.js");
    const names = getBuiltinSkillNames();
    const installed: SkillManifest[] = [];

    for (const name of names) {
      try {
        const existing = this.skillManager.getSkill(name);
        if (!existing) {
          const manifest = this.installBuiltin(name);
          installed.push(manifest);
        }
      } catch (error) {
        logger.debug(`Failed to install builtin skill '${name}': ${error}`);
      }
    }

    if (installed.length > 0) {
      logger.info(`Installed ${installed.length} builtin skills`);
    }

    return installed;
  }
}

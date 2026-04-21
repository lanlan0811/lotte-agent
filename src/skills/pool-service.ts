import type { SkillManifest, ScanResult } from "./types.js";
import { SkillManager } from "./manager.js";
import { SkillScanner } from "./scanner.js";
import { getBuiltinSkillDefinitions, getBuiltinSkillByName } from "./builtins.js";
import { logger } from "../utils/logger.js";

export interface SkillPoolServiceDeps {
  skillManager: SkillManager;
}

export class SkillPoolService {
  private skillManager: SkillManager;
  private scanner: SkillScanner;

  constructor(deps: SkillPoolServiceDeps) {
    this.skillManager = deps.skillManager;
    this.scanner = new SkillScanner();
  }

  listSkills(options?: { enabled?: boolean; source?: SkillManifest["source"]; tag?: string }): SkillManifest[] {
    let skills = this.skillManager.listSkills();

    if (options?.enabled !== undefined) {
      skills = skills.filter((s) => s.enabled === options.enabled);
    }

    if (options?.source) {
      skills = skills.filter((s) => s.source === options.source);
    }

    if (options?.tag) {
      skills = skills.filter((s) => s.tags?.includes(options.tag!));
    }

    return skills;
  }

  getSkill(name: string): SkillManifest | undefined {
    return this.skillManager.getSkill(name);
  }

  getSkillContent(name: string): string | null {
    const builtin = getBuiltinSkillByName(name);
    if (builtin) {
      return builtin.content;
    }

    const skill = this.skillManager.getSkill(name);
    return skill?.content ?? null;
  }

  addSkill(skill: Omit<SkillManifest, "createdAt" | "updatedAt" | "signature">): SkillManifest {
    return this.skillManager.addSkill(skill);
  }

  updateSkill(name: string, updates: Partial<Pick<SkillManifest, "description" | "content" | "enabled" | "tags" | "references" | "scripts">>): SkillManifest | null {
    return this.skillManager.updateSkill(name, updates);
  }

  removeSkill(name: string): boolean {
    return this.skillManager.removeSkill(name);
  }

  toggleSkill(name: string): SkillManifest | null {
    return this.skillManager.toggleSkill(name);
  }

  scanSkill(skillDir: string, skillName?: string): ScanResult {
    return this.scanner.scanSkill(skillDir, skillName);
  }

  scanAllSkills(): ScanResult[] {
    const results: ScanResult[] = [];
    const skills = this.skillManager.listSkills();
    const poolDir = this.skillManager.getPoolDir();

    for (const skill of skills) {
      const skillDir = `${poolDir}/${skill.name}`;
      const result = this.scanner.scanSkill(skillDir, skill.name);
      results.push(result);
    }

    return results;
  }

  getEnabledSkillContents(): string[] {
    const builtinDefs = getBuiltinSkillDefinitions();
    const builtinContents = builtinDefs.map((d) => d.content);

    const localSkills = this.skillManager.getEnabledSkills();
    const localContents = localSkills.map((s) => s.content);

    return [...builtinContents, ...localContents];
  }

  getSkillSummary(): {
    total: number;
    enabled: number;
    bySource: Record<string, number>;
    byTag: Record<string, number>;
  } {
    const skills = this.skillManager.listSkills();
    const enabled = skills.filter((s) => s.enabled);
    const bySource: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const skill of skills) {
      bySource[skill.source] = (bySource[skill.source] ?? 0) + 1;
      for (const tag of skill.tags ?? []) {
        byTag[tag] = (byTag[tag] ?? 0) + 1;
      }
    }

    return {
      total: skills.length,
      enabled: enabled.length,
      bySource,
      byTag,
    };
  }

  ensureBuiltinSkills(): void {
    const builtinDefs = getBuiltinSkillDefinitions();
    for (const def of builtinDefs) {
      const existing = this.skillManager.getSkill(def.name);
      if (!existing) {
        this.skillManager.addSkill({
          name: def.name,
          version: def.version,
          description: def.description,
          enabled: true,
          source: "builtin",
          tags: def.tags,
          content: def.content,
          references: {},
          scripts: {},
        });
        logger.info(`Builtin skill registered: ${def.name}`);
      }
    }
  }
}

import type { SkillSearchResult, SkillInstallResult } from "./types.js";
import { SkillManager } from "./manager.js";
import { logger } from "../utils/logger.js";

const DEFAULT_HUB_BASE_URL = "https://clawhub.ai";
const HTTP_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const BACKOFF_BASE = 0.8;
const BACKOFF_CAP = 6.0;

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class SkillHubClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(options?: { baseUrl?: string; timeout?: number; retries?: number }) {
    this.baseUrl = options?.baseUrl ?? DEFAULT_HUB_BASE_URL;
    this.timeout = options?.timeout ?? HTTP_TIMEOUT;
    this.retries = options?.retries ?? MAX_RETRIES;
  }

  async search(query: string, options?: { limit?: number; offset?: number }): Promise<SkillSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0),
    });

    const url = `${this.baseUrl}/api/v1/search?${params}`;
    const data = await this.httpGet(url);

    return this.normalizeSearchItems(data);
  }

  async getDetail(slug: string): Promise<SkillSearchResult | null> {
    const url = `${this.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`;
    try {
      const data = await this.httpGet(url);
      return this.normalizeDetailItem(data, slug);
    } catch (error) {
      logger.debug(`Failed to get skill detail for '${slug}': ${error}`);
      return null;
    }
  }

  async installFromHub(slug: string, skillManager: SkillManager, options?: { version?: string }): Promise<SkillInstallResult> {
    const url = `${this.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`;
    const data = await this.httpGet(url);

    const { name, content, references, scripts } = this.extractBundle(data, slug);

    const existing = skillManager.getSkill(name);
    if (existing) {
      throw new SkillConflictError(`Skill '${name}' already exists`, name);
    }

    const manifest = skillManager.addSkill({
      name,
      version: options?.version ?? "0.1.0",
      description: this.extractDescription(data),
      enabled: true,
      source: "hub",
      sourceUrl: url,
      content,
      references,
      scripts,
    });

    return {
      name: manifest.name,
      enabled: manifest.enabled,
      sourceUrl: url,
    };
  }

  private async httpGet(url: string): Promise<unknown> {
    const attempts = this.retries + 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "lotte-skills-hub/1.0",
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const status = response.status;

          if (attempt < attempts && RETRYABLE_STATUS.has(status)) {
            const delay = this.computeBackoff(attempt);
            logger.debug(`Hub HTTP ${status} on ${url} (attempt ${attempt}/${attempts}), retrying in ${delay.toFixed(2)}s`);
            await this.sleep(delay);
            continue;
          }

          throw new Error(`Hub returned ${status} after ${attempt - 1} retries`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < attempts) {
          const delay = this.computeBackoff(attempt);
          logger.debug(`Hub error on ${url} (attempt ${attempt}/${attempts}), retrying in ${delay.toFixed(2)}s: ${lastError.message}`);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw lastError ?? new Error(`Failed to request hub URL: ${url}`);
  }

  private computeBackoff(attempt: number): number {
    return Math.min(BACKOFF_CAP, BACKOFF_BASE * Math.pow(2, Math.max(0, attempt - 1)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms * 1000));
  }

  private normalizeSearchItems(data: unknown): SkillSearchResult[] {
    if (Array.isArray(data)) {
      return data.filter((x) => typeof x === "object" && x !== null).map((item) => this.toSearchResult(item as Record<string, unknown>));
    }

    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      for (const key of ["items", "skills", "results", "data"]) {
        const value = obj[key];
        if (Array.isArray(value)) {
          return value.filter((x) => typeof x === "object" && x !== null).map((item) => this.toSearchResult(item as Record<string, unknown>));
        }
      }
    }

    return [];
  }

  private normalizeDetailItem(data: unknown, slug: string): SkillSearchResult | null {
    if (typeof data !== "object" || data === null) return null;
    const obj = data as Record<string, unknown>;
    const skill = (obj.skill ?? obj) as Record<string, unknown>;
    return this.toSearchResult(skill, slug);
  }

  private toSearchResult(item: Record<string, unknown>, fallbackSlug?: string): SkillSearchResult {
    return {
      slug: String(item.slug ?? item.name ?? fallbackSlug ?? ""),
      name: String(item.name ?? item.displayName ?? item.slug ?? ""),
      description: String(item.description ?? ""),
      version: String(item.version ?? item.latestVersion ?? ""),
      sourceUrl: String(item.sourceUrl ?? item.url ?? ""),
    };
  }

  private extractBundle(data: unknown, slug: string): {
    name: string;
    content: string;
    references: Record<string, unknown>;
    scripts: Record<string, unknown>;
  } {
    if (typeof data !== "object" || data === null) {
      throw new Error("Hub bundle is not a valid object");
    }

    const obj = data as Record<string, unknown>;
    const payload = (obj.skill ?? obj) as Record<string, unknown>;

    let content = String(payload.content ?? payload.skill_md ?? payload.skillMd ?? "");
    let references = (payload.references ?? {}) as Record<string, unknown>;
    let scripts = (payload.scripts ?? {}) as Record<string, unknown>;

    const files = payload.files as Record<string, string> | undefined;
    if (files && typeof files === "object") {
      if (!content && files["SKILL.md"]) {
        content = files["SKILL.md"];
      }
      const fileRefs: Record<string, unknown> = {};
      const fileScripts: Record<string, unknown> = {};
      for (const [rel, fileContent] of Object.entries(files)) {
        if (rel.startsWith("references/")) {
          const key = rel.slice("references/".length);
          fileRefs[key] = fileContent;
        } else if (rel.startsWith("scripts/")) {
          const key = rel.slice("scripts/".length);
          fileScripts[key] = fileContent;
        }
      }
      if (!Object.keys(references).length) references = fileRefs;
      if (!Object.keys(scripts).length) scripts = fileScripts;
    }

    if (!content) {
      throw new Error("Hub bundle missing SKILL.md content");
    }

    const name = String(payload.name ?? slug);
    if (!name) {
      throw new Error("Hub bundle missing skill name");
    }

    return { name, content, references, scripts };
  }

  private extractDescription(data: unknown): string {
    if (typeof data !== "object" || data === null) return "";
    const obj = data as Record<string, unknown>;
    const payload = (obj.skill ?? obj) as Record<string, unknown>;
    return String(payload.description ?? "");
  }
}

export class SkillConflictError extends Error {
  skillName: string;

  constructor(message: string, skillName: string) {
    super(message);
    this.name = "SkillConflictError";
    this.skillName = skillName;
  }
}

export function suggestConflictName(name: string): string {
  return `${name}-copy`;
}

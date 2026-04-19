import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

export interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  timestamp: number;
  source: string;
  importance: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface LongTermMemoryConfig {
  dataDir: string;
  maxEntries: number;
  embeddingDimension: number;
}

const DEFAULT_LTM_CONFIG: Partial<LongTermMemoryConfig> = {
  maxEntries: 10000,
  embeddingDimension: 1536,
};

export class LongTermMemory {
  private memoryDir: string;
  private config: LongTermMemoryConfig;
  private entries: Map<string, MemoryEntry> = new Map();
  private dirty = false;

  constructor(config: LongTermMemoryConfig) {
    this.config = { ...DEFAULT_LTM_CONFIG, ...config };
    this.memoryDir = path.join(config.dataDir, "memory");
  }

  initialize(): void {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    this.loadFromDisk();
    logger.info(`Long-term memory initialized with ${this.entries.size} entries`);
  }

  store(content: string, options?: { tags?: string[]; source?: string; importance?: number }): MemoryEntry {
    const entry: MemoryEntry = {
      id: this.generateId(),
      content,
      tags: options?.tags ?? [],
      timestamp: Date.now(),
      source: options?.source ?? "user",
      importance: options?.importance ?? 0.5,
    };

    this.entries.set(entry.id, entry);
    this.dirty = true;
    this.enforceLimits();
    this.persistToDisk();

    logger.debug(`Stored memory entry: ${entry.id}`);
    return entry;
  }

  retrieve(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  search(query: string, options?: { limit?: number; tags?: string[]; minImportance?: number }): MemorySearchResult[] {
    const limit = options?.limit ?? 10;
    const minImportance = options?.minImportance ?? 0;
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    const results: MemorySearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (entry.importance < minImportance) continue;

      if (options?.tags && options.tags.length > 0) {
        const hasTag = options.tags.some((tag) => entry.tags.includes(tag));
        if (!hasTag) continue;
      }

      const score = this.computeRelevanceScore(entry, queryTerms, queryLower);
      if (score > 0) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  delete(id: string): boolean {
    const deleted = this.entries.delete(id);
    if (deleted) {
      this.dirty = true;
      this.persistToDisk();
    }
    return deleted;
  }

  update(id: string, updates: Partial<Pick<MemoryEntry, "content" | "tags" | "importance">>): MemoryEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    if (updates.content !== undefined) entry.content = updates.content;
    if (updates.tags !== undefined) entry.tags = updates.tags;
    if (updates.importance !== undefined) entry.importance = updates.importance;

    this.dirty = true;
    this.persistToDisk();
    return entry;
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  getByTag(tag: string): MemoryEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.tags.includes(tag));
  }

  getBySource(source: string): MemoryEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.source === source);
  }

  size(): number {
    return this.entries.size;
  }

  exportToMarkdown(): string {
    const entries = Array.from(this.entries.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );

    const sections = entries.map((entry) => {
      const date = new Date(entry.timestamp).toISOString();
      const tags = entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : "";
      return `## ${entry.id}${tags}\n\n- **Source**: ${entry.source}\n- **Date**: ${date}\n- **Importance**: ${entry.importance}\n\n${entry.content}`;
    });

    return `# Memory\n\n${sections.join("\n\n---\n\n")}`;
  }

  importFromMarkdown(markdown: string): number {
    const sections = markdown.split(/^---$/m).filter(Boolean);
    let imported = 0;

    for (const section of sections) {
      const contentMatch = section.match(/##\s+(.+?)(?:\s*\[(.+?)\])?\s*\n/);
      if (!contentMatch) continue;

      const id = contentMatch[1]?.trim() ?? "";
      const tags = contentMatch[2]
        ? contentMatch[2].split(",").map((t) => t.trim())
        : [];

      const sourceMatch = section.match(/\*\*Source\*\*:\s*(.+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(.+)/);
      const importanceMatch = section.match(/\*\*Importance\*\*:\s*(.+)/);

      const contentStart = section.indexOf("\n\n", section.indexOf("##"));
      const content = contentStart >= 0 ? section.slice(contentStart).trim() : "";

      if (content && id) {
        this.entries.set(id, {
          id,
          content,
          tags,
          timestamp: dateMatch?.[1] ? new Date(dateMatch[1].trim()).getTime() : Date.now(),
          source: sourceMatch?.[1]?.trim() ?? "import",
          importance: importanceMatch?.[1] ? parseFloat(importanceMatch[1].trim()) : 0.5,
        });
        imported++;
      }
    }

    if (imported > 0) {
      this.dirty = true;
      this.persistToDisk();
    }

    return imported;
  }

  private computeRelevanceScore(entry: MemoryEntry, queryTerms: string[], queryLower: string): number {
    const contentLower = entry.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const regex = new RegExp(term, "gi");
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (contentLower.includes(queryLower)) {
      score += 5;
    }

    for (const tag of entry.tags) {
      if (queryTerms.some((term) => tag.toLowerCase().includes(term))) {
        score += 3;
      }
    }

    score *= entry.importance;

    const ageHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
    const recencyBoost = Math.max(0, 1 - ageHours / 720);
    score += recencyBoost * 2;

    return score;
  }

  private enforceLimits(): void {
    if (this.entries.size <= this.config.maxEntries) return;

    const sorted = Array.from(this.entries.values()).sort(
      (a, b) => a.importance - b.importance || a.timestamp - b.timestamp,
    );

    const toRemove = this.entries.size - this.config.maxEntries;
    for (let i = 0; i < toRemove; i++) {
      const entry = sorted[i];
      if (entry) this.entries.delete(entry.id);
    }
  }

  private loadFromDisk(): void {
    const memoryFile = path.join(this.memoryDir, "memory.json");
    if (!fs.existsSync(memoryFile)) return;

    try {
      const data = JSON.parse(fs.readFileSync(memoryFile, "utf-8"));
      if (Array.isArray(data)) {
        for (const entry of data) {
          this.entries.set(entry.id, entry);
        }
      }
    } catch (error) {
      logger.error(`Failed to load memory from disk: ${error}`);
    }
  }

  private persistToDisk(): void {
    if (!this.dirty) return;

    const memoryFile = path.join(this.memoryDir, "memory.json");
    const data = Array.from(this.entries.values());

    try {
      fs.writeFileSync(memoryFile, JSON.stringify(data, null, 2), "utf-8");
      this.dirty = false;
    } catch (error) {
      logger.error(`Failed to persist memory to disk: ${error}`);
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

import { z } from "zod";
import type { ToolDefinition } from "../tool-registry.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { MemorySearchResult } from "../../memory/long-term.js";

const MemorySearchSchema = z.object({
  query: z.string().describe("搜索查询文本"),
  limit: z.number().min(1).max(50).optional().describe("返回结果数量上限，默认10"),
  tags: z.array(z.string()).optional().describe("按标签过滤"),
  min_importance: z.number().min(0).max(1).optional().describe("最低重要性阈值"),
});

const MemoryStoreSchema = z.object({
  content: z.string().describe("要存储的记忆内容"),
  tags: z.array(z.string()).optional().describe("记忆标签"),
  source: z.string().optional().describe("记忆来源"),
  importance: z.number().min(0).max(1).optional().describe("重要性评分，0-1"),
});

const MemoryGetSchema = z.object({
  id: z.string().describe("记忆条目ID"),
});

const MemoryDeleteSchema = z.object({
  id: z.string().describe("要删除的记忆条目ID"),
});

interface MemorySearchArgs {
  query: string;
  limit?: number;
  tags?: string[];
  min_importance?: number;
}

interface MemoryStoreArgs {
  content: string;
  tags?: string[];
  source?: string;
  importance?: number;
}

interface MemoryGetArgs {
  id: string;
}

interface MemoryDeleteArgs {
  id: string;
}

let memoryManager: MemoryManager | null = null;

export function setMemoryManager(manager: MemoryManager): void {
  memoryManager = manager;
}

export const memorySearchTool: ToolDefinition = {
  name: "memory_search",
  description: "搜索长期记忆库，查找与查询相关的记忆条目。使用关键词或描述性查询来检索之前存储的信息。",
  category: "memory",
  parameters: MemorySearchSchema,
  execute: async (rawArgs) => {
    if (!memoryManager) {
      return "Memory system not available.";
    }

    const args = rawArgs as unknown as MemorySearchArgs;
    const results: MemorySearchResult[] = memoryManager.searchLongTerm(args.query, args.limit);
    const filtered = args.tags
      ? results.filter((r: MemorySearchResult) => args.tags!.some((tag: string) => r.entry.tags.includes(tag)))
      : results;
    const finalResults = args.min_importance !== undefined
      ? filtered.filter((r: MemorySearchResult) => r.entry.importance >= args.min_importance!)
      : filtered;

    if (finalResults.length === 0) {
      return `No memories found matching "${args.query}".`;
    }

    const lines = finalResults.map((r: MemorySearchResult, i: number) => {
      const date = new Date(r.entry.timestamp).toISOString().split("T")[0];
      const tags = r.entry.tags.length > 0 ? ` [${r.entry.tags.join(", ")}]` : "";
      return `${i + 1}. [${r.entry.id}]${tags} (score: ${r.score.toFixed(2)}, importance: ${r.entry.importance}, date: ${date})\n   ${r.entry.content.slice(0, 300)}`;
    });

    return `Found ${finalResults.length} memories:\n\n${lines.join("\n\n")}`;
  },
};

export const memoryStoreTool: ToolDefinition = {
  name: "memory_store",
  description: "将信息存储到长期记忆库，以便后续检索。适用于保存重要事实、用户偏好、关键决策等。",
  category: "memory",
  parameters: MemoryStoreSchema,
  execute: async (rawArgs) => {
    if (!memoryManager) {
      return "Memory system not available.";
    }

    const args = rawArgs as unknown as MemoryStoreArgs;
    const entry = memoryManager.getLongTerm().store(args.content, {
      tags: args.tags,
      source: args.source ?? "tool",
      importance: args.importance ?? 0.5,
    });

    return `Memory stored successfully.\nID: ${entry.id}\nTags: ${entry.tags.join(", ") || "none"}\nImportance: ${entry.importance}`;
  },
};

export const memoryGetTool: ToolDefinition = {
  name: "memory_get",
  description: "根据ID获取特定的记忆条目。",
  category: "memory",
  parameters: MemoryGetSchema,
  execute: async (rawArgs) => {
    if (!memoryManager) {
      return "Memory system not available.";
    }

    const args = rawArgs as unknown as MemoryGetArgs;
    const entry = memoryManager.getLongTerm().retrieve(args.id);
    if (!entry) {
      return `Memory entry not found: ${args.id}`;
    }

    const date = new Date(entry.timestamp).toISOString();
    return `ID: ${entry.id}\nSource: ${entry.source}\nDate: ${date}\nImportance: ${entry.importance}\nTags: ${entry.tags.join(", ") || "none"}\n\n${entry.content}`;
  },
};

export const memoryDeleteTool: ToolDefinition = {
  name: "memory_delete",
  description: "删除指定的记忆条目。谨慎使用。",
  category: "memory",
  parameters: MemoryDeleteSchema,
  requiresApproval: true,
  execute: async (rawArgs) => {
    if (!memoryManager) {
      return "Memory system not available.";
    }

    const args = rawArgs as unknown as MemoryDeleteArgs;
    const deleted = memoryManager.getLongTerm().delete(args.id);
    return deleted ? `Memory entry deleted: ${args.id}` : `Memory entry not found: ${args.id}`;
  },
};

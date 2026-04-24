import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { QQ_MSG_SEQ_MAX, QQ_MSG_SEQ_PRUNE, QQ_FALLBACK_MARKDOWN_CODES, QQ_MEDIA_SUBDIR } from "./constants.js";

const msgSeqMap: Map<string, number> = new Map();

export function getNextMsgSeq(key: string): number {
  let n = (msgSeqMap.get(key) ?? 0) + 1;
  msgSeqMap.set(key, n);
  if (msgSeqMap.size > QQ_MSG_SEQ_MAX) {
    let count = 0;
    for (const k of msgSeqMap.keys()) {
      if (count >= QQ_MSG_SEQ_PRUNE) break;
      msgSeqMap.delete(k);
      count++;
    }
  }
  return n;
}

export function shouldFallbackFromMarkdown(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  if (msg.includes("markdown")) return true;
  if (msg.includes("不允许发送原生 markdown")) return true;
  for (const code of QQ_FALLBACK_MARKDOWN_CODES) {
    if (msg.includes(code)) return true;
  }
  return false;
}

export function isUrlContentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("url") ||
    msg.includes("链接") ||
    msg.includes("1200003") ||
    msg.includes("40034013")
  );
}

export function sanitizeQqText(text: string): { text: string; hadUrl: boolean } {
  let hadUrl = false;
  const result = text.replace(/https?:\/\/[^\s<>\]]+/g, () => {
    hadUrl = true;
    return "";
  });
  return { text: result.replace(/\n{3,}/g, "\n\n").trim(), hadUrl };
}

export function aggressiveSanitizeQqText(text: string): { text: string; hadUrl: boolean } {
  let hadUrl = false;
  const result = text.replace(/(?:https?:\/\/)[^\s<>\]]*/g, () => {
    hadUrl = true;
    return "";
  });
  const cleaned = result
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, hadUrl };
}

export function ensureMediaDir(baseDir?: string): string {
  const base = baseDir ?? join(homedir(), ".lotte", "data", "media");
  const dir = join(base, QQ_MEDIA_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_.]/g, "_") || "file";
}

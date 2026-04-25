import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  FEISHU_SESSION_ID_SUFFIX_LEN,
  MAX_TABLES_PER_CARD,
  FEISHU_MEDIA_SUBDIR,
} from "./constants.js";
import { logger } from "../../utils/logger.js";

export function shortSessionIdFromFullId(fullId: string): string {
  const n = FEISHU_SESSION_ID_SUFFIX_LEN;
  return fullId.length >= n ? fullId.slice(-n) : fullId;
}

export function senderDisplayString(
  nickname: string | undefined | null,
  senderId: string,
): string {
  const nick = (nickname ?? "").trim();
  const sid = (senderId ?? "").trim();
  const suffix = sid.length >= 4 ? sid.slice(-4) : sid || "????";
  return `${nick || "unknown"}#${suffix}`;
}

export function extractJsonKey(
  content: string | undefined | null,
  ...keys: string[]
): string | undefined {
  if (!content) return undefined;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.debug("Feishu utils: failed to parse JSON content for extractValue");
    return undefined;
  }
  for (const k of keys) {
    const v = data[k] ?? data[k.replace(/_/g, "").toLowerCase()];
    if (v && typeof v === "string") return v.trim();
  }
  return undefined;
}

const MAGIC_BYTES_MAP: [Buffer, string][] = [
  [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
  [Buffer.from("GIF8"), "gif"],
  [Buffer.from("%PDF"), "pdf"],
  [Buffer.from([0x50, 0x4b, 0x03, 0x04]), "zip"],
  [Buffer.from("ID3"), "mp3"],
  [Buffer.from([0xff, 0xfb]), "mp3"],
  [Buffer.from([0xff, 0xfa]), "mp3"],
  [Buffer.from("OggS"), "ogg"],
  [Buffer.from("fLaC"), "flac"],
  [Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "webm"],
];

export function detectFileExt(data: Buffer, defaultExt = "bin"): string {
  if (!data || data.length === 0) return defaultExt;
  for (const [magic, ext] of MAGIC_BYTES_MAP) {
    if (data.length >= magic.length && data.subarray(0, magic.length).equals(magic)) {
      return ext;
    }
  }
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (data.length > 8 && data.subarray(4, 8).toString("ascii") === "ftyp") {
    return "mp4";
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpg";
  }
  return defaultExt;
}

export function extractPostText(content: string | undefined | null): string | undefined {
  if (!content) return undefined;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.debug("Feishu utils: failed to parse JSON content for extractPostText");
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;

  const parts: string[] = [];

  const title = data.title;
  if (typeof title === "string" && title.trim()) {
    parts.push(title.trim());
  }

  const contentBlocks = data.content;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      if (!Array.isArray(block)) continue;
      for (const item of block) {
        if (typeof item !== "object" || item === null) continue;
        const tag = (item as Record<string, unknown>).tag as string;
        if (tag === "text" || tag === "code_block" || tag === "md") {
          const text = (item as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim()) parts.push(text.trim());
        } else if (tag === "a") {
          const text = (item as Record<string, unknown>).text as string;
          const href = (item as Record<string, unknown>).href as string;
          if (href) {
            parts.push(text ? `[${text}](${href})` : href);
          } else if (text) {
            parts.push(text.trim());
          }
        } else if (tag === "at") {
          const userName =
            ((item as Record<string, unknown>).user_name as string) ??
            ((item as Record<string, unknown>).user_id as string);
          if (typeof userName === "string" && userName.trim()) {
            parts.push(`@${userName.trim()}`);
          }
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function extractPostKeys(
  content: string | undefined | null,
  tag: string,
  keyName: string,
): string[] {
  if (!content) return [];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.debug("Feishu utils: failed to parse JSON content for extractKeys");
    return [];
  }
  if (typeof data !== "object" || data === null) return [];
  const keys: string[] = [];
  const contentBlocks = data.content;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      if (!Array.isArray(block)) continue;
      for (const item of block) {
        if (typeof item !== "object" || item === null) continue;
        if ((item as Record<string, unknown>).tag === tag) {
          const key = (item as Record<string, unknown>)[keyName];
          if (typeof key === "string" && key.trim()) keys.push(key.trim());
        }
      }
    }
  }
  return keys;
}

export function extractPostImageKeys(content: string | undefined | null): string[] {
  return extractPostKeys(content, "img", "image_key");
}

export function extractPostMediaFileKeys(content: string | undefined | null): string[] {
  return extractPostKeys(content, "media", "file_key");
}

export function normalizeFeishuMd(text: string): string {
  if (!text || !text.trim()) return text;
  return text.replace(/([^\n])(```)/g, "$1\n$2");
}

function parseMdTable(tableLines: string[]): Record<string, unknown> | null {
  const lines = tableLines.filter((ln) => ln.trim());
  if (lines.length < 2) return null;

  let sepIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln && /^\s*\|[\s\-:|]+\|\s*$/.test(ln)) {
      sepIdx = i;
      break;
    }
  }
  if (sepIdx <= 0) return null;

  function splitRow(line: string): string[] {
    let stripped = line.trim();
    if (stripped.startsWith("|")) stripped = stripped.slice(1);
    if (stripped.endsWith("|")) stripped = stripped.slice(0, -1);
    return stripped.split("|").map((c) => c.trim());
  }

  const headers = splitRow(lines[0]!);
  if (headers.length === 0) return null;
  const colKeys = headers.map((_, i) => `col${i}`);

  function parseAlignment(sepLine: string): string[] {
    return splitRow(sepLine).map((cell) => {
      const s = cell.trim();
      if (s.startsWith(":") && s.endsWith(":")) return "center";
      if (s.endsWith(":")) return "right";
      return "left";
    });
  }

  const alignments = parseAlignment(lines[sepIdx]!);

  const columns = headers.map((h, i) => ({
    name: colKeys[i] ?? `col${i}`,
    display_name: h,
    width: "auto",
    horizontal_align: alignments[i] ?? "left",
  }));

  const rows: Record<string, string>[] = [];
  for (let r = sepIdx + 1; r < lines.length; r++) {
    const cells = splitRow(lines[r]!);
    const row: Record<string, string> = {};
    for (let i = 0; i < colKeys.length; i++) {
      let cellText = cells[i] ?? "";
      cellText = cellText.replace(/[*_]{1,2}(.+?)[*_]{1,2}/g, "$1");
      const key = colKeys[i] ?? `col${i}`;
      row[key] = cellText;
    }
    rows.push(row);
  }
  if (rows.length === 0) return null;

  return {
    tag: "table",
    page_size: Math.min(Math.max(rows.length, 10), 50),
    columns,
    rows,
  };
}

function convertMdHeadingsToBold(text: string): string {
  return text.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
}

function buildElements(text: string): Record<string, unknown>[] {
  const lines = text.split("\n");
  const elements: Record<string, unknown>[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line && /^\s*\|/.test(line)) {
      const tableBlock: string[] = [];
      while (i < lines.length) {
        const ln = lines[i];
        if (!ln || !/^\s*\|/.test(ln)) break;
        tableBlock.push(ln);
        i++;
      }
      const tableElem = parseMdTable(tableBlock);
      if (tableElem) {
        elements.push(tableElem);
      } else {
        elements.push({
          tag: "markdown",
          content: convertMdHeadingsToBold(tableBlock.join("\n")),
        });
      }
    } else {
      const textBlock: string[] = [];
      while (i < lines.length) {
        const ln = lines[i];
        if (!ln || /^\s*\|/.test(ln)) break;
        textBlock.push(ln);
        i++;
      }
      const content = textBlock.join("\n").trim();
      if (content) {
        elements.push({
          tag: "markdown",
          content: convertMdHeadingsToBold(content),
        });
      }
    }
  }
  if (elements.length === 0) {
    elements.push({
      tag: "markdown",
      content: convertMdHeadingsToBold(text),
    });
  }
  return elements;
}

function splitElements(
  elements: Record<string, unknown>[],
): Record<string, unknown>[][] {
  const chunks: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let pending: Record<string, unknown>[] = [];
  let tableCount = 0;

  for (const elem of elements) {
    if (elem.tag === "table") {
      if (tableCount >= MAX_TABLES_PER_CARD) {
        chunks.push(current);
        current = [...pending];
        tableCount = 0;
      } else {
        current.push(...pending);
      }
      pending = [];
      current.push(elem);
      tableCount++;
    } else {
      pending.push(elem);
    }
  }
  current.push(...pending);
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function buildInteractiveContent(text: string): string {
  const elements = buildElements(text);
  const card = { elements };
  return JSON.stringify(card);
}

export function buildInteractiveContentChunks(text: string): string[] {
  const elements = buildElements(text);
  const chunks = splitElements(elements);
  return chunks.map((chunk) =>
    JSON.stringify({ elements: chunk }),
  );
}

export function ensureMediaDir(baseDir: string): string {
  const dir = join(baseDir, FEISHU_MEDIA_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDefaultMediaDir(): string {
  const base = join(homedir(), ".lotte", "data", "media");
  mkdirSync(base, { recursive: true });
  return base;
}

export function safeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9\-_.]/g, "") || "file";
}

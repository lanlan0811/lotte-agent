import { logger } from "../../utils/logger.js";

const MEDIA_TOKEN_RE = /\bMEDIA:\s*`?([^\n`]+)`?/gi;

export interface ParsedMediaSegment {
  type: "text" | "media";
  text?: string;
  url?: string;
}

export function parseMediaTokens(text: string): ParsedMediaSegment[] {
  const segments: ParsedMediaSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(MEDIA_TOKEN_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
      });
    }

    const rawUrl = match[1]?.trim();
    if (rawUrl) {
      const cleaned = cleanMediaUrl(rawUrl);
      if (cleaned) {
        segments.push({
          type: "media",
          url: cleaned,
        });
      } else {
        segments.push({
          type: "text",
          text: match[0],
        });
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return segments;
}

export function stripMediaTokens(text: string): string {
  return text.replace(MEDIA_TOKEN_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractMediaUrls(text: string): string[] {
  const urls: string[] = [];
  const regex = new RegExp(MEDIA_TOKEN_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawUrl = match[1]?.trim();
    if (rawUrl) {
      const cleaned = cleanMediaUrl(rawUrl);
      if (cleaned) {
        urls.push(cleaned);
      }
    }
  }

  return urls;
}

export function buildMediaToken(url: string): string {
  return `MEDIA: ${url}`;
}

export function buildMediaHttpUrl(mediaId: string, port: number): string {
  return `http://127.0.0.1:${port}/media/${mediaId}`;
}

export interface MediaToken {
  raw: string;
  filePath: string;
  mediaUrl: string;
}

export function replaceMediaTokens(text: string, mediaServerUrl: string): string {
  const regex = new RegExp(MEDIA_TOKEN_RE.source, "gi");
  return text.replace(regex, (fullMatch, rawPath: string) => {
    const cleaned = cleanMediaUrl(rawPath?.trim());
    if (!cleaned) return fullMatch;

    if (isHttpUrl(cleaned) || isDataUrl(cleaned)) {
      return cleaned;
    }

    const filename = cleaned.split(/[\\/]/).pop() ?? cleaned;
    return `${mediaServerUrl}/media/${encodeURIComponent(filename)}`;
  });
}

export function isMediaToken(text: string): boolean {
  return /\bMEDIA:\s*`?[^\n`]+`?/i.test(text);
}

export function extractMediaTokens(text: string, mediaServerUrl: string): MediaToken[] {
  const tokens: MediaToken[] = [];
  const regex = new RegExp(MEDIA_TOKEN_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawUrl = match[1]?.trim();
    if (rawUrl) {
      const cleaned = cleanMediaUrl(rawUrl);
      if (cleaned) {
        const filename = cleaned.split(/[\\/]/).pop() ?? cleaned;
        tokens.push({
          raw: match[0],
          filePath: cleaned,
          mediaUrl: `${mediaServerUrl}/media/${encodeURIComponent(filename)}`,
        });
      }
    }
  }

  return tokens;
}

function cleanMediaUrl(raw: string): string | null {
  const candidate = raw.replace(/^[`"'[{(]+/, "").replace(/[`"'\\})\],]+$/, "");

  if (!candidate || candidate.length > 4096) {
    return null;
  }

  if (candidate.startsWith("../") || candidate === ".." || candidate.startsWith("~")) {
    logger.warn(`Rejected media path with traversal or home dir: ${candidate}`);
    return null;
  }

  if (isHttpUrl(candidate) || isDataUrl(candidate)) {
    return candidate;
  }

  if (isLocalFilePath(candidate)) {
    return normalizeFilePath(candidate);
  }

  return candidate;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isLocalFilePath(candidate: string): boolean {
  return (
    candidate.startsWith("/") ||
    candidate.startsWith("./") ||
    WINDOWS_DRIVE_RE.test(candidate) ||
    candidate.startsWith("\\\\") ||
    (!SCHEME_RE.test(candidate) && (candidate.includes("/") || candidate.includes("\\")))
  );
}

function normalizeFilePath(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return filePath.replace("file://", "");
  }
  return filePath;
}

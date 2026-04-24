import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { WEIXIN_CDN_BASE, WEIXIN_MEDIA_SUBDIR } from "./constants.js";

export function normalizeAesKey(keyB64: string): Buffer {
  const raw = keyB64.trim();

  if (/^[0-9a-fA-F]{32}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (/^[0-9a-fA-F]{48}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    decoded = Buffer.from(raw, "utf-8");
  }

  if (decoded.length === 16) {
    return decoded;
  }

  if (decoded.length === 32 && /^[0-9a-fA-F]+$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }

  return decoded;
}

export function aesEcbDecrypt(data: Buffer, keyB64: string): Buffer {
  const key = normalizeAesKey(keyB64);
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error(
      `Invalid AES key length: ${key.length} (from key_b64=${keyB64.slice(0, 20)})`,
    );
  }
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function aesEcbEncrypt(data: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function generateAesKeyB64(): string {
  return crypto.randomBytes(16).toString("base64");
}

export function generateAesKeyHex(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function encodeAesKeyForMsg(aesKeyHex: string): string {
  return Buffer.from(aesKeyHex, "utf-8").toString("base64");
}

export function buildCdnDownloadUrl(encryptQueryParam: string): string {
  const enc = encodeURIComponent(encryptQueryParam);
  return `${WEIXIN_CDN_BASE}/download?encrypted_query_param=${enc}`;
}

export function buildCdnUploadUrl(encryptQueryParam: string): string {
  const enc = encodeURIComponent(encryptQueryParam);
  return `${WEIXIN_CDN_BASE}/upload?encrypted_query_param=${enc}`;
}

export function ensureMediaDir(baseDir?: string): string {
  const base = baseDir ?? join(homedir(), ".lotte", "data", "media");
  const dir = join(base, WEIXIN_MEDIA_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeIlinkHeaders(botToken: string = ""): Record<string, string> {
  const uinVal = crypto.randomInt(0, 0xffffffff);
  const uinB64 = Buffer.from(String(uinVal), "utf-8").toString("base64");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": uinB64,
  };
  if (botToken) {
    headers["Authorization"] = `Bearer ${botToken}`;
  }
  return headers;
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_.]/g, "_") || "file";
}

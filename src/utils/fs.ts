import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger.js";

export function ensureDir(dirPath: string, mode = 0o700): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
  }
}

export function ensureFileDir(filePath: string, mode = 0o700): void {
  const dir = path.dirname(filePath);
  ensureDir(dir, mode);
}

export function readFileText(filePath: string, encoding: BufferEncoding = "utf-8"): string {
  return fs.readFileSync(filePath, encoding);
}

export function writeFileText(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): void {
  ensureFileDir(filePath);
  fs.writeFileSync(filePath, content, encoding);
}

export function readFileJSON<T>(filePath: string): T {
  const content = readFileText(filePath);
  return JSON.parse(content) as T;
}

export function writeFileJSON(filePath: string, data: unknown, indent = 2): void {
  const content = JSON.stringify(data, null, indent) + "\n";
  writeFileText(filePath, content);
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    logger.debug(`File access check failed: ${filePath}`);
    return false;
  }
}

export function dirExists(dirPath: string): boolean {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch {
    logger.debug(`Directory check failed: ${dirPath}`);
    return false;
  }
}

export function getFileHash(filePath: string, algorithm: string = "sha256"): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash(algorithm).update(content).digest("hex");
}

export function getStringHash(content: string, algorithm: string = "sha256"): string {
  return crypto.createHash(algorithm).update(content).digest("hex");
}

export function getFileSize(filePath: string): number {
  const stat = fs.statSync(filePath);
  return stat.size;
}

export function getFileMtime(filePath: string): number {
  const stat = fs.statSync(filePath);
  return stat.mtimeMs;
}

export function safeRemove(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    logger.debug("Best effort directory removal failed");
  }
}

export function listFiles(dirPath: string, pattern?: RegExp): string[] {
  if (!dirExists(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isFile()) {
      if (!pattern || pattern.test(entry.name)) {
        files.push(path.join(dirPath, entry.name));
      }
    }
  }

  return files;
}

export function listDirs(dirPath: string): string[] {
  if (!dirExists(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs.push(path.join(dirPath, entry.name));
    }
  }

  return dirs;
}

export function copyFile(src: string, dest: string): void {
  ensureFileDir(dest);
  fs.copyFileSync(src, dest);
}

export function moveFile(src: string, dest: string): void {
  ensureFileDir(dest);
  fs.renameSync(src, dest);
}

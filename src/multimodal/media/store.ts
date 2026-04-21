import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import type { MediaConfig, MediaFile } from "../types.js";
import { logger } from "../../utils/logger.js";

const MAX_FILENAME_LENGTH = 255;
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/octet-stream",
  "text/plain",
];

export class MediaStore {
  private storageDir: string;
  private ttl: number;
  private files: Map<string, MediaFile> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MediaConfig) {
    this.storageDir = config.storage_dir;
    this.ttl = config.ttl_seconds;
  }

  initialize(): void {
    if (!this.storageDir) {
      this.storageDir = path.join(process.cwd(), ".lotte", "media");
    }

    fs.mkdirSync(this.storageDir, { recursive: true });
    this.loadExistingFiles();
    this.startCleanup();
    logger.info(`Media store initialized: ${this.storageDir}`);
  }

  store(data: Buffer, mimeType: string, filename?: string): MediaFile {
    const id = crypto.randomUUID();
    const ext = this.getExtensionFromMime(mimeType);
    const storedFilename = filename ?? `${id}${ext}`;

    if (storedFilename.length > MAX_FILENAME_LENGTH) {
      const safeExt = path.extname(storedFilename);
      const truncated = storedFilename.slice(0, MAX_FILENAME_LENGTH - safeExt.length - 1);
      const finalName = truncated + safeExt;
      return this.storeInternal(id, data, mimeType, finalName);
    }

    return this.storeInternal(id, data, mimeType, storedFilename);
  }

  storeFromPath(filePath: string, mimeType?: string): MediaFile | null {
    if (!fs.existsSync(filePath)) {
      logger.warn(`File not found: ${filePath}`);
      return null;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      logger.warn(`Not a file: ${filePath}`);
      return null;
    }

    const resolved = path.resolve(filePath);
    const filename = path.basename(resolved);
    const detectedMime = mimeType ?? this.guessMimeType(filename);
    const data = fs.readFileSync(resolved);

    return this.store(data, detectedMime, filename);
  }

  get(id: string): Buffer | null {
    const mediaFile = this.files.get(id);
    if (!mediaFile) return null;

    if (this.isExpired(mediaFile)) {
      this.delete(id);
      return null;
    }

    const filePath = path.join(this.storageDir, mediaFile.filename);
    if (!fs.existsSync(filePath)) {
      this.files.delete(id);
      return null;
    }

    return fs.readFileSync(filePath);
  }

  getMetadata(id: string): MediaFile | undefined {
    const file = this.files.get(id);
    if (file && this.isExpired(file)) {
      this.delete(id);
      return undefined;
    }
    return file;
  }

  getByFilename(filename: string): Buffer | null {
    const safeName = this.sanitizeFilename(filename);
    const filePath = path.join(this.storageDir, safeName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath);
  }

  getMetadataByFilename(filename: string): MediaFile | undefined {
    const safeName = this.sanitizeFilename(filename);
    for (const file of this.files.values()) {
      if (file.filename === safeName) {
        if (this.isExpired(file)) {
          this.delete(file.id);
          return undefined;
        }
        return file;
      }
    }

    const filePath = path.join(this.storageDir, safeName);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const id = path.basename(safeName, path.extname(safeName));
      const mimeType = this.guessMimeType(safeName);
      const mediaFile: MediaFile = {
        id,
        filename: safeName,
        mimeType,
        size: stat.size,
        createdAt: stat.mtimeMs,
        ttl: this.ttl,
      };
      this.files.set(id, mediaFile);
      return mediaFile;
    }

    return undefined;
  }

  delete(id: string): boolean {
    const mediaFile = this.files.get(id);
    if (!mediaFile) return false;

    const filePath = path.join(this.storageDir, mediaFile.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }

    this.files.delete(id);
    return true;
  }

  list(): MediaFile[] {
    const now = Date.now();
    return Array.from(this.files.values()).filter(
      (f) => !this.isExpired(f),
    );
  }

  isExpired(file: MediaFile): boolean {
    return Date.now() - file.createdAt > file.ttl * 1000;
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private storeInternal(id: string, data: Buffer, mimeType: string, filename: string): MediaFile {
    const safeName = this.sanitizeFilename(filename);
    const filePath = path.join(this.storageDir, safeName);

    fs.writeFileSync(filePath, data);

    const mediaFile: MediaFile = {
      id,
      filename: safeName,
      mimeType,
      size: data.length,
      createdAt: Date.now(),
      ttl: this.ttl,
    };

    this.files.set(id, mediaFile);
    return mediaFile;
  }

  private sanitizeFilename(filename: string): string {
    let safe = filename.replace(/[<>:"|?*\x00-\x1f]/g, "_");
    safe = safe.replace(/\.\./g, "");
    safe = safe.replace(/^[/\\]+/, "");
    return safe;
  }

  private loadExistingFiles(): void {
    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        const filePath = path.join(this.storageDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const id = path.basename(file, path.extname(file));
          const mimeType = this.guessMimeType(file);
          this.files.set(id, {
            id,
            filename: file,
            mimeType,
            size: stat.size,
            createdAt: stat.mtimeMs,
            ttl: this.ttl,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const [id, file] of this.files.entries()) {
        if (this.isExpired(file)) {
          this.delete(id);
        }
      }
    }, 60000);
  }

  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "video/mp4": ".mp4",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
    };
    return mimeToExt[mimeType] ?? ".bin";
  }

  private guessMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const extToMime: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
    };
    return extToMime[ext] ?? "application/octet-stream";
  }
}

export class MediaServer {
  private store: MediaStore;
  private server: http.Server | null = null;
  private port: number;

  constructor(store: MediaStore, port: number) {
    this.store = store;
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        logger.info(`Media server started on http://127.0.0.1:${this.port}`);
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Method Not Allowed");
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const match = url.pathname.match(/^\/media\/(.+)$/);

    if (!match) {
      this.sendJson(res, 404, { error: "NOT_FOUND", message: "Not found" });
      return;
    }

    const rawId = decodeURIComponent(match[1]!);

    if (this.isPathTraversal(rawId)) {
      this.sendJson(res, 403, { error: "FORBIDDEN", message: "Invalid media ID" });
      return;
    }

    let data: Buffer | null = null;
    let metadata: MediaFile | undefined;

    metadata = this.store.getMetadata(rawId);
    if (metadata) {
      data = this.store.get(rawId);
    }

    if (!data || !metadata) {
      metadata = this.store.getMetadataByFilename(rawId);
      if (metadata) {
        data = this.store.getByFilename(rawId);
      }
    }

    if (!data || !metadata) {
      this.sendJson(res, 404, { error: "NOT_FOUND", message: "Media not found" });
      return;
    }

    if (!ALLOWED_MIME_PREFIXES.some((prefix) => metadata!.mimeType.startsWith(prefix))) {
      this.sendJson(res, 403, { error: "FORBIDDEN", message: "MIME type not allowed" });
      return;
    }

    const rangeHeader = req.headers["range"];
    if (rangeHeader) {
      this.handleRangeRequest(res, data, metadata, rangeHeader);
      return;
    }

    const headOnly = req.method === "HEAD";

    res.writeHead(200, {
      "Content-Type": metadata.mimeType,
      "Content-Length": data.length,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${metadata.id}"`,
    });

    if (headOnly) {
      res.end();
    } else {
      res.end(data);
    }
  }

  private handleRangeRequest(
    res: http.ServerResponse,
    data: Buffer,
    metadata: MediaFile,
    rangeHeader: string,
  ): void {
    const rangeMatch = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (!rangeMatch) {
      res.writeHead(416, { "Content-Range": `bytes */${data.length}` });
      res.end();
      return;
    }

    const start = parseInt(rangeMatch[1]!, 10);
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : data.length - 1;

    if (start >= data.length || end >= data.length || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${data.length}` });
      res.end();
      return;
    }

    const chunk = data.subarray(start, end + 1);

    res.writeHead(206, {
      "Content-Type": metadata.mimeType,
      "Content-Length": chunk.length,
      "Content-Range": `bytes ${start}-${end}/${data.length}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });

    res.end(chunk);
  }

  private isPathTraversal(id: string): boolean {
    if (id.includes("..")) return true;
    if (id.includes("\\")) return true;
    if (id.startsWith("/")) return true;
    if (id.startsWith("~")) return true;
    return false;
  }

  private sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
    res.writeHead(status, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(body));
  }
}

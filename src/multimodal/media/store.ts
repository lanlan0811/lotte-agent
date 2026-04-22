import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MediaConfig, MediaFile } from "../types.js";
import { logger } from "../../utils/logger.js";

const MAX_MEDIA_ID_CHARS = 200;
const MEDIA_ID_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

function isValidMediaId(id: string): boolean {
  if (!id || id === "." || id === "..") return false;
  if (id.length > MAX_MEDIA_ID_CHARS) return false;
  return MEDIA_ID_PATTERN.test(id);
}

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
    const filePath = path.join(this.storageDir, storedFilename);

    fs.writeFileSync(filePath, data);

    const mediaFile: MediaFile = {
      id,
      filename: storedFilename,
      mimeType,
      size: data.length,
      createdAt: Date.now(),
      ttl: this.ttl,
    };

    this.files.set(id, mediaFile);
    return mediaFile;
  }

  get(id: string): Buffer | null {
    if (!isValidMediaId(id)) return null;

    const mediaFile = this.files.get(id);
    if (!mediaFile) return null;

    if (this.isExpired(mediaFile)) {
      this.delete(id);
      return null;
    }

    const filePath = path.join(this.storageDir, mediaFile.filename);
    const realPath = this.resolveSafePath(filePath);
    if (!realPath) return null;

    if (!fs.existsSync(realPath)) {
      this.files.delete(id);
      return null;
    }

    const stat = fs.statSync(realPath);
    if (stat.size > MAX_MEDIA_BYTES) {
      logger.warn(`Media file too large: ${id} (${stat.size} bytes)`);
      return null;
    }

    return fs.readFileSync(realPath);
  }

  getMetadata(id: string): MediaFile | undefined {
    if (!isValidMediaId(id)) return undefined;
    const meta = this.files.get(id);
    if (meta && this.isExpired(meta)) {
      this.delete(id);
      return undefined;
    }
    return meta;
  }

  isExpired(file: MediaFile): boolean {
    return Date.now() - file.createdAt > file.ttl * 1000;
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
    return Array.from(this.files.values());
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  resolveSafePath(filePath: string): string | null {
    try {
      const realPath = fs.realpathSync(filePath);
      if (!realPath.startsWith(this.storageDir)) {
        logger.warn(`Path traversal attempt blocked: ${filePath}`);
        return null;
      }
      return realPath;
    } catch {
      return null;
    }
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
      const now = Date.now();
      for (const [id, file] of this.files.entries()) {
        if (now - file.createdAt > file.ttl * 1000) {
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

export function registerMediaRoutes(
  fastify: FastifyInstance,
  store: MediaStore,
  prefix = "/media",
): void {
  fastify.get(`${prefix}/:id`, async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header("X-Content-Type-Options", "nosniff");

    const { id } = req.params as { id: string };

    if (!isValidMediaId(id)) {
      reply.code(400).send({ ok: false, error: { code: "INVALID_MEDIA_ID", message: "Invalid media ID" } });
      return;
    }

    const metadata = store.getMetadata(id);
    if (!metadata) {
      reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: "Media not found" } });
      return;
    }

    if (store.isExpired(metadata)) {
      store.delete(id);
      reply.code(410).send({ ok: false, error: { code: "EXPIRED", message: "Media has expired" } });
      return;
    }

    const data = store.get(id);
    if (!data) {
      reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: "Media data not found" } });
      return;
    }

    reply.header("Content-Type", metadata.mimeType);
    reply.header("Content-Length", data.length);
    reply.header("Cache-Control", "private, max-age=3600");
    reply.send(data);
  });

  fastify.get(`${prefix}`, async (_req: FastifyRequest, reply: FastifyReply) => {
    const files = store.list();
    reply.send({
      ok: true,
      data: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        expired: store.isExpired(f),
      })),
    });
  });

  logger.info(`Media routes registered at ${prefix}`);
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

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader("X-Content-Type-Options", "nosniff");

    const url = req.url ?? "/";
    const match = url.match(/^\/media\/(.+)$/);

    if (!match) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const id = match[1]!;

    if (!isValidMediaId(id)) {
      res.writeHead(400);
      res.end("Invalid media ID");
      return;
    }

    const metadata = this.store.getMetadata(id);
    if (!metadata) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (this.store.isExpired(metadata)) {
      this.store.delete(id);
      res.writeHead(410);
      res.end("Expired");
      return;
    }

    const data = this.store.get(id);
    if (!data) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": metadata.mimeType,
      "Content-Length": data.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.end(data);
  }
}

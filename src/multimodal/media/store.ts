import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import type { MediaConfig, MediaFile } from "../types.js";
import { logger } from "../../utils/logger.js";

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
    const mediaFile = this.files.get(id);
    if (!mediaFile) return null;

    const filePath = path.join(this.storageDir, mediaFile.filename);
    if (!fs.existsSync(filePath)) {
      this.files.delete(id);
      return null;
    }

    return fs.readFileSync(filePath);
  }

  getMetadata(id: string): MediaFile | undefined {
    return this.files.get(id);
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

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
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
    const url = req.url ?? "/";
    const match = url.match(/^\/media\/(.+)$/);

    if (!match) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const id = match[1];
    const data = this.store.get(id);
    const metadata = this.store.getMetadata(id);

    if (!data || !metadata) {
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

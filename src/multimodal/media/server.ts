import http from "node:http";
import type { MediaStore } from "./store.js";
import { isValidMediaId } from "./store.js";
import { logger } from "../../utils/logger.js";

const DEFAULT_MEDIA_PORT = 42873;
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60_000;

export interface MediaServerOptions {
  port?: number;
  host?: string;
  ttlMs?: number;
}

export class MediaServer {
  private store: MediaStore;
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: MediaStore, options: MediaServerOptions = {}) {
    this.store = store;
    this.port = options.port ?? DEFAULT_MEDIA_PORT;
    this.host = options.host ?? "127.0.0.1";
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        logger.info(`Media server started on http://${this.host}:${this.port}`);
        resolve();
      });
      this.server!.on("error", reject);
    });

    this.startCleanup();
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  getPort(): number {
    return this.port;
  }

  getHost(): string {
    return this.host;
  }

  getTtlMs(): number {
    return this.ttlMs;
  }

  getUrl(mediaId: string): string {
    return `http://${this.host}:${this.port}/media/${mediaId}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    const url = req.url ?? "/";
    const parsed = new URL(url, `http://${this.host}:${this.port}`);
    const pathname = parsed.pathname;

    if (pathname === "/media" || pathname === "/media/") {
      this.handleList(res);
      return;
    }

    const match = pathname.match(/^\/media\/(.+)$/);
    if (!match) {
      this.sendError(res, 404, "Not found");
      return;
    }

    const id = match[1]!;
    this.handleGetMedia(id, res);
  }

  private handleGetMedia(id: string, res: http.ServerResponse): void {
    if (!isValidMediaId(id)) {
      this.sendError(res, 400, "Invalid media ID");
      return;
    }

    const metadata = this.store.getMetadata(id);
    if (!metadata) {
      this.sendError(res, 404, "Not found");
      return;
    }

    if (this.store.isExpired(metadata)) {
      this.store.delete(id);
      this.sendError(res, 410, "Expired");
      return;
    }

    const data = this.store.get(id);
    if (!data) {
      this.sendError(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": metadata.mimeType,
      "Content-Length": data.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.end(data);
  }

  private handleList(res: http.ServerResponse): void {
    const files = this.store.list();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(
      JSON.stringify({
        ok: true,
        data: files.map((f) => ({
          id: f.id,
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: f.createdAt,
          url: this.getUrl(f.id),
        })),
      }),
    );
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const files = this.store.list();
      let cleaned = 0;
      for (const file of files) {
        if (this.store.isExpired(file)) {
          this.store.delete(file.id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        logger.debug(`Media cleanup: removed ${cleaned} expired file(s)`);
      }
    }, CLEANUP_INTERVAL_MS);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private sendError(res: http.ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
  }
}

export function resolveMediaUrl(
  mediaId: string,
  host: string = "127.0.0.1",
  port: number = DEFAULT_MEDIA_PORT,
): string {
  return `http://${host}:${port}/media/${mediaId}`;
}

import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../utils/logger.js";

const STATIC_ASSET_EXTENSIONS = new Set([
  ".js", ".css", ".json", ".map", ".svg", ".png", ".jpg", ".jpeg",
  ".gif", ".webp", ".ico", ".txt", ".woff", ".woff2", ".ttf", ".eot",
]);

const INDEX_HTML = "index.html";

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".map": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".ttf": return "font/ttf";
    case ".eot": return "application/vnd.ms-fontobject";
    default: return "application/octet-stream";
  }
}

function isSafeRelativePath(relPath: string): boolean {
  if (!relPath) return false;
  const normalized = path.posix.normalize(relPath);
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) return false;
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("\0")) return false;
  return true;
}

function applySecurityHeaders(reply: FastifyReply): void {
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "no-referrer");
}

function resolveWebUiRoot(configuredRoot: string): string | null {
  if (configuredRoot) {
    if (fs.existsSync(configuredRoot) && fs.statSync(configuredRoot).isDirectory()) {
      return configuredRoot;
    }
    logger.warn(`Configured Web UI root not found: ${configuredRoot}`);
    return null;
  }

  const candidates = [
    path.resolve(process.cwd(), "Web", "out"),
    path.resolve(process.cwd(), "web", "out"),
    path.resolve(process.argv[1] ?? process.cwd(), "..", "Web", "out"),
  ];

  for (const candidate of candidates) {
    try {
      const real = fs.realpathSync(candidate);
      if (fs.existsSync(path.join(real, INDEX_HTML))) {
        return real;
      }
    } catch {
      logger.debug("Web UI root candidate not accessible");
    }
  }

  return null;
}

export function registerWebUiRoutes(
  fastify: FastifyInstance,
  webConfig: { enabled: boolean; root: string; base_path: string },
  gatewayAddress: string,
): void {
  if (!webConfig.enabled) {
    logger.debug("Web UI disabled in config");
    return;
  }

  const root = resolveWebUiRoot(webConfig.root);
  if (!root) {
    logger.warn(
      "Web UI enabled but static assets not found. Build with: cd Web && npm run build",
    );
    return;
  }

  logger.info(`Web UI serving from: ${root}`);

  const basePath = webConfig.base_path && webConfig.base_path !== "/"
    ? webConfig.base_path.replace(/\/$/, "")
    : "";

  const bootstrapPath = basePath ? `${basePath}/__lotte/bootstrap.json` : "/__lotte/bootstrap.json";

  fastify.get(bootstrapPath, async (_req: FastifyRequest, reply: FastifyReply) => {
    applySecurityHeaders(reply);
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Cache-Control", "no-cache");
    reply.send({
      basePath,
      gatewayAddress,
      serverVersion: "0.1.0",
    });
  });

  const prefix = basePath || "/";

  fastify.get(`${prefix === "/" ? "" : prefix}/*`, async (req: FastifyRequest, reply: FastifyReply) => {
    await serveStaticFile(req, reply, root, basePath);
  });

  if (!basePath) {
    fastify.get("/", async (_req: FastifyRequest, reply: FastifyReply) => {
      await serveStaticFile(_req, reply, root, basePath);
    });
  } else {
    fastify.get(basePath, async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.redirect(`${basePath}/`, 301);
    });
    fastify.get(`${basePath}/`, async (_req: FastifyRequest, reply: FastifyReply) => {
      await serveStaticFile(_req, reply, root, basePath);
    });
  }
}

async function serveStaticFile(
  req: FastifyRequest,
  reply: FastifyReply,
  root: string,
  basePath: string,
): Promise<void> {
  applySecurityHeaders(reply);

  const urlPath = req.url.split("?")[0] || "/";
  let relPath = basePath && urlPath.startsWith(basePath)
    ? urlPath.slice(basePath.length)
    : urlPath;
  relPath = relPath.startsWith("/") ? relPath.slice(1) : relPath;

  if (!relPath || relPath === "/") {
    relPath = INDEX_HTML;
  }

  if (!isSafeRelativePath(relPath)) {
    reply.code(403).send("Forbidden");
    return;
  }

  const ext = path.extname(relPath).toLowerCase();

  if (ext && STATIC_ASSET_EXTENSIONS.has(ext)) {
    const filePath = path.join(root, relPath);
    try {
      const realPath = fs.realpathSync(filePath);
      if (!realPath.startsWith(root)) {
        reply.code(403).send("Forbidden");
        return;
      }
      if (!fs.existsSync(realPath) || !fs.statSync(realPath).isFile()) {
        reply.code(404).send("Not Found");
        return;
      }
      const stream = fs.createReadStream(realPath);
      reply.header("Content-Type", contentTypeForExt(ext));
      reply.header("Cache-Control", "no-cache");
      reply.send(stream);
      return;
    } catch {
      reply.code(404).send("Not Found");
      return;
    }
  }

  const htmlPath = path.join(root, relPath);
  try {
    const realPath = fs.realpathSync(htmlPath);
    if (!realPath.startsWith(root)) {
      reply.code(403).send("Forbidden");
      return;
    }
    if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
      const stream = fs.createReadStream(realPath);
      const fileExt = path.extname(realPath).toLowerCase();
      reply.header("Content-Type", contentTypeForExt(fileExt));
      reply.header("Cache-Control", "no-cache");
      reply.send(stream);
      return;
    }
  } catch {
    logger.debug("Web UI root resolution failed, falling through");
  }

  const indexPath = path.join(root, INDEX_HTML);
  try {
    if (fs.existsSync(indexPath)) {
      const stream = fs.createReadStream(indexPath);
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.send(stream);
      return;
    }
  } catch {
    logger.debug("Web UI root resolution failed, falling through");
  }

  reply.code(404).send("Not Found");
}

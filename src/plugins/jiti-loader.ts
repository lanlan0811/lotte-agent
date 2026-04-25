import { createJiti } from "jiti";
import { logger } from "../utils/logger.js";

export type JitiLoaderCache = Map<string, ReturnType<typeof createJiti>>;

const loaderCache: JitiLoaderCache = new Map();

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

function isTypeScriptFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return TS_EXTENSIONS.has(ext);
}

function toSafeImportPath(specifier: string): string {
  if (process.platform !== "win32") {
    return specifier;
  }
  if (specifier.startsWith("file://")) {
    return specifier;
  }
  const normalized = specifier.replaceAll("\\", "/");
  if (/^[A-Za-z]:/.test(normalized)) {
    return new URL(`file:///${encodeURI(normalized)}`).href;
  }
  return specifier;
}

function getCachedJitiLoader(modulePath: string): ReturnType<typeof createJiti> {
  const cacheKey = modulePath;
  const cached = loaderCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loader = createJiti(modulePath, {
    tryNative: true,
    interopDefault: true,
    cache: true,
    sourceMaps: true,
  });

  loaderCache.set(cacheKey, loader);
  return loader;
}

export async function loadModuleWithJiti(modulePath: string): Promise<unknown> {
  if (!isTypeScriptFile(modulePath)) {
    const safePath = toSafeImportPath(modulePath);
    const module = await import(safePath);
    return unwrapDefaultModuleExport(module);
  }

  logger.debug(`Loading TypeScript plugin via JITI: ${modulePath}`);

  const loader = getCachedJitiLoader(modulePath);
  const module = await loader.import(modulePath);
  return unwrapDefaultModuleExport(module);
}

function unwrapDefaultModuleExport(module: unknown): unknown {
  if (module && typeof module === "object") {
    const rec = module as Record<string, unknown>;
    if ("default" in rec) {
      const def = rec.default;
      if (def && typeof def === "object" && "default" in (def as Record<string, unknown>)) {
        return (def as Record<string, unknown>).default;
      }
      return def;
    }
  }
  return module;
}

export function clearJitiLoaderCache(): void {
  loaderCache.clear();
}

export { isTypeScriptFile, toSafeImportPath };

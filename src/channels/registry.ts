import { BaseChannel } from "./base.js";
import { logger } from "../utils/logger.js";

type ChannelConstructor = new (...args: unknown[]) => BaseChannel;

interface ChannelSpec {
  modulePath: string;
  className: string;
}

const BUILTIN_SPECS: Record<string, ChannelSpec> = {
  weixin: { modulePath: "./weixin/channel.js", className: "WeixinChannel" },
  qq: { modulePath: "./qq/channel.js", className: "QQChannel" },
  feishu: { modulePath: "./feishu/channel.js", className: "FeishuChannel" },
  console: { modulePath: "./console/channel.js", className: "ConsoleChannel" },
};

const REQUIRED_CHANNELS: Set<string> = new Set(["console"]);

const channelCache: Map<string, ChannelConstructor> = new Map();

async function loadBuiltinChannel(key: string): Promise<ChannelConstructor | null> {
  if (channelCache.has(key)) return channelCache.get(key)!;

  const spec = BUILTIN_SPECS[key];
  if (!spec) return null;

  try {
    const mod = await import(spec.modulePath);
    const cls = mod[spec.className];
    if (!cls || !(cls.prototype instanceof BaseChannel)) {
      throw new TypeError(`${spec.modulePath}.${spec.className} is not a BaseChannel subtype`);
    }
    channelCache.set(key, cls);
    return cls;
  } catch (error) {
    if (REQUIRED_CHANNELS.has(key)) {
      logger.error(`Failed to load required channel "${key}": ${error}`);
      throw error;
    }
    logger.debug(`Built-in channel unavailable: ${key} - ${error}`);
    return null;
  }
}

export async function getChannelRegistry(): Promise<Map<string, ChannelConstructor>> {
  const registry = new Map<string, ChannelConstructor>();
  for (const key of Object.keys(BUILTIN_SPECS)) {
    const cls = await loadBuiltinChannel(key);
    if (cls) registry.set(key, cls);
  }
  return registry;
}

export function getBuiltinChannelKeys(): Set<string> {
  return new Set(Object.keys(BUILTIN_SPECS));
}

export { BUILTIN_SPECS };

import os from "node:os";
import process from "node:process";

export type Platform = "windows" | "macos" | "linux" | "unknown";

export function getPlatform(): Platform {
  const platform = os.platform();
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}

export function isWindows(): boolean {
  return getPlatform() === "windows";
}

export function isMacOS(): boolean {
  return getPlatform() === "macos";
}

export function isLinux(): boolean {
  return getPlatform() === "linux";
}

export function getArch(): string {
  return os.arch();
}

export function getNodeVersion(): string {
  return process.version;
}

export function getOSInfo(): string {
  return `${os.type()} ${os.release()} (${os.arch()})`;
}

export function getHomeDir(): string {
  return os.homedir();
}

export function getTmpDir(): string {
  return os.tmpdir();
}

export function getShell(): string {
  if (isWindows()) {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/sh";
}

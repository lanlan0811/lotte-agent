import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../utils/logger.js";
import { ensureDir } from "../utils/fs.js";

export interface ErrorDump {
  trace: string;
  exception_type: string;
  exception_message: string;
  request_info: {
    session_id?: string;
    channel_id?: string;
    tool_name?: string;
  };
  ts_utc: string;
}

export class ErrorDumper {
  private dumpsDir: string;

  constructor(dumpsDir: string) {
    this.dumpsDir = dumpsDir;
  }

  dump(error: unknown, context?: ErrorDump["request_info"]): string | null {
    try {
      ensureDir(this.dumpsDir);

      const trace = error instanceof Error ? error.stack ?? "" : String(error);
      const exceptionType = error instanceof Error ? error.constructor.name : "Unknown";
      const exceptionMessage = error instanceof Error ? error.message : String(error);

      const dump: ErrorDump = {
        trace,
        exception_type: exceptionType,
        exception_message: exceptionMessage,
        request_info: context ?? {},
        ts_utc: new Date().toISOString(),
      };

      const id = crypto.randomUUID().slice(0, 8);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `error-${timestamp}-${id}.json`;
      const filePath = path.join(this.dumpsDir, filename);

      fs.writeFileSync(filePath, JSON.stringify(dump, null, 2) + "\n", "utf-8");
      logger.error(`Error dump written to ${filePath}`);

      return filePath;
    } catch (dumpError) {
      logger.error("Failed to write error dump", dumpError);
      return null;
    }
  }

  listDumps(): string[] {
    if (!fs.existsSync(this.dumpsDir)) {
      return [];
    }

    return fs
      .readdirSync(this.dumpsDir)
      .filter((name) => name.startsWith("error-") && name.endsWith(".json"))
      .sort()
      .reverse();
  }

  readDump(filename: string): ErrorDump | null {
    const filePath = path.join(this.dumpsDir, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as ErrorDump;
    } catch {
      return null;
    }
  }

  cleanOldDumps(maxAge = 7 * 24 * 60 * 60 * 1000): number {
    if (!fs.existsSync(this.dumpsDir)) {
      return 0;
    }

    const now = Date.now();
    let cleaned = 0;

    const files = fs.readdirSync(this.dumpsDir);
    for (const file of files) {
      if (!file.startsWith("error-") || !file.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(this.dumpsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // Skip files that can't be stat'd
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} old error dumps`);
    }

    return cleaned;
  }
}

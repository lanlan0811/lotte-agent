export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: " INFO",
  warn: " WARN",
  error: "ERROR",
};

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamp: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.prefix = options.prefix ?? "lotte";
    this.timestamp = options.timestamp ?? true;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log("error", message, ...args);
  }

  child(options: LoggerOptions = {}): Logger {
    const childPrefix = options.prefix
      ? `${this.prefix}:${options.prefix}`
      : this.prefix;
    return new Logger({
      level: options.level ?? this.level,
      prefix: childPrefix,
      timestamp: options.timestamp ?? this.timestamp,
    });
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const parts: string[] = [];

    if (this.timestamp) {
      parts.push(this.formatTimestamp());
    }

    parts.push(`[${LEVEL_LABELS[level]}]`);
    parts.push(`[${this.prefix}]`);
    parts.push(message);

    const formatted = parts.join(" ");

    if (args.length > 0) {
      const errorArg = args.find(
        (arg) => arg instanceof Error || (typeof arg === "object" && arg !== null && "message" in arg),
      );

      if (errorArg instanceof Error) {
        switch (level) {
          case "error":
            console.error(formatted, errorArg.message);
            if (errorArg.stack) {
              console.error(errorArg.stack);
            }
            break;
          case "warn":
            console.warn(formatted, errorArg.message);
            break;
          default:
            console.log(formatted, errorArg.message);
        }
      } else {
        switch (level) {
          case "error":
            console.error(formatted, ...args);
            break;
          case "warn":
            console.warn(formatted, ...args);
            break;
          default:
            console.log(formatted, ...args);
        }
      }
    } else {
      switch (level) {
        case "error":
          console.error(formatted);
          break;
        case "warn":
          console.warn(formatted);
          break;
        default:
          console.log(formatted);
      }
    }
  }

  private formatTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
}

export const logger = new Logger();

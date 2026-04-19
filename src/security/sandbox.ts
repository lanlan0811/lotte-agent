import vm from "node:vm";
import { logger } from "../utils/logger.js";

export interface SandboxConfig {
  timeout: number;
  maxMemoryMB: number;
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowChildProcess: boolean;
  allowedModules: string[];
  deniedModules: string[];
  maxConsoleOutput: number;
}

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeout: 30000,
  maxMemoryMB: 128,
  allowFileSystem: false,
  allowNetwork: false,
  allowChildProcess: false,
  allowedModules: [],
  deniedModules: ["child_process", "fs", "net", "http", "https", "dgram", "cluster", "os"],
  maxConsoleOutput: 10000,
};

export interface SandboxResult {
  success: boolean;
  result: unknown;
  error?: string;
  consoleOutput: string[];
  executionTimeMs: number;
  memoryUsedMB: number;
}

export class VMSandbox {
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  async execute(code: string, context?: Record<string, unknown>): Promise<SandboxResult> {
    const startTime = Date.now();
    const consoleOutput: string[] = [];
    let memoryUsed = 0;

    const sandbox: Record<string, unknown> = {
      console: this.createSafeConsole(consoleOutput),
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      Promise,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      RegExp,
      Symbol,
      undefined,
      NaN,
      Infinity,
      ...context,
    };

    if (this.config.allowFileSystem) {
      sandbox.require = this.createSafeRequire();
    }

    vm.createContext(sandbox);

    try {
      const script = new vm.Script(code, {
        filename: "sandbox.js",
      });

      const result = script.runInContext(sandbox, {
        timeout: this.config.timeout,
      });

      memoryUsed = process.memoryUsage().heapUsed / (1024 * 1024);

      return {
        success: true,
        result,
        consoleOutput,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB: memoryUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("timeout") || errorMessage.includes("SIGTERM")) {
        logger.warn(`Sandbox execution timed out after ${this.config.timeout}ms`);
      }

      return {
        success: false,
        result: undefined,
        error: errorMessage,
        consoleOutput,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB: memoryUsed,
      };
    }
  }

  async executeAsync(code: string, context?: Record<string, unknown>): Promise<SandboxResult> {
    const wrappedCode = `(async () => { ${code} })()`;

    const startTime = Date.now();
    const consoleOutput: string[] = [];

    const sandbox: Record<string, unknown> = {
      console: this.createSafeConsole(consoleOutput),
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      Promise,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      RegExp,
      Symbol,
      undefined,
      NaN,
      Infinity,
      setTimeout: (fn: (...args: unknown[]) => void, ms: number) => {
        if (ms > this.config.timeout) {
          throw new Error(`setTimeout delay ${ms}ms exceeds sandbox timeout`);
        }
        return global.setTimeout(fn, ms);
      },
      clearTimeout: global.clearTimeout,
      ...context,
    };

    if (this.config.allowFileSystem) {
      sandbox.require = this.createSafeRequire();
    }

    vm.createContext(sandbox);

    try {
      const script = new vm.Script(wrappedCode, {
        filename: "sandbox-async.js",
      });

      const resultPromise = script.runInContext(sandbox, {
        timeout: this.config.timeout,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        global.setTimeout(() => {
          reject(new Error(`Sandbox execution timed out after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      const memoryUsed = process.memoryUsage().heapUsed / (1024 * 1024);

      return {
        success: true,
        result,
        consoleOutput,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB: memoryUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        result: undefined,
        error: errorMessage,
        consoleOutput,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMB: 0,
      };
    }
  }

  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      new vm.Script(code, { filename: "validate.js" });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { valid: false, errors };
    }

    const dangerousPatterns = [
      { pattern: /process\s*\.\s*exit/, message: "process.exit() is not allowed" },
      { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/, message: "child_process module is not allowed" },
      { pattern: /require\s*\(\s*['"]cluster['"]\s*\)/, message: "cluster module is not allowed" },
    ];

    if (!this.config.allowFileSystem) {
      dangerousPatterns.push({
        pattern: /require\s*\(\s*['"]fs['"]\s*\)/,
        message: "fs module is not allowed",
      });
    }

    if (!this.config.allowNetwork) {
      dangerousPatterns.push(
        {
          pattern: /require\s*\(\s*['"]net['"]\s*\)/,
          message: "net module is not allowed",
        },
        {
          pattern: /require\s*\(\s*['"]http['"]\s*\)/,
          message: "http module is not allowed",
        },
        {
          pattern: /require\s*\(\s*['"]https['"]\s*\)/,
          message: "https module is not allowed",
        },
      );
    }

    for (const check of dangerousPatterns) {
      if (check.pattern.test(code)) {
        errors.push(check.message);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private createSafeConsole(output: string[]): Record<string, (...args: unknown[]) => void> {
    const maxOutput = this.config.maxConsoleOutput;
    let totalLength = 0;

    const addOutput = (method: string, args: unknown[]) => {
      const text = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      const line = `[${method}] ${text}`;
      totalLength += line.length;

      if (totalLength <= maxOutput) {
        output.push(line);
      }
    };

    return {
      log: (...args: unknown[]) => addOutput("log", args),
      info: (...args: unknown[]) => addOutput("info", args),
      warn: (...args: unknown[]) => addOutput("warn", args),
      error: (...args: unknown[]) => addOutput("error", args),
      debug: (...args: unknown[]) => addOutput("debug", args),
    };
  }

  private createSafeRequire(): (module: string) => unknown {
    const allowed = this.config.allowedModules;
    const denied = this.config.deniedModules;

    return (moduleName: string) => {
      if (denied.includes(moduleName)) {
        throw new Error(`Module "${moduleName}" is not allowed in sandbox`);
      }

      if (allowed.length > 0 && !allowed.includes(moduleName)) {
        throw new Error(`Module "${moduleName}" is not in the allowed list`);
      }

      try {
        return require(moduleName);
      } catch {
        throw new Error(`Failed to load module "${moduleName}"`);
      }
    };
  }
}

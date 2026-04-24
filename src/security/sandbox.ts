import vm from "node:vm";
import * as acorn from "acorn";
import type { Node, CallExpression, MemberExpression, Identifier, Literal } from "acorn";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

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
      const errorMessage = formatErrorMessage(error);

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
      const errorMessage = formatErrorMessage(error);

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

    let ast: Node;
    try {
      ast = acorn.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        locations: true,
      });
    } catch (error) {
      errors.push(formatErrorMessage(error));
      return { valid: false, errors };
    }

    const deniedModules = new Set(this.config.deniedModules);

    if (!this.config.allowFileSystem) {
      deniedModules.add("fs");
      deniedModules.add("fs/promises");
    }
    if (!this.config.allowNetwork) {
      deniedModules.add("net");
      deniedModules.add("http");
      deniedModules.add("https");
      deniedModules.add("dgram");
    }
    if (!this.config.allowChildProcess) {
      deniedModules.add("child_process");
    }

    const deniedGlobalAccess = new Set<string>();
    if (!this.config.allowFileSystem) {
      deniedGlobalAccess.add("__dirname");
      deniedGlobalAccess.add("__filename");
    }

    this.walkAST(ast, (node) => {
      if (node.type === "CallExpression") {
        const callExpr = node as CallExpression;

        if (this.isProcessExit(callExpr)) {
          errors.push(`process.exit() is not allowed (line ${callExpr.loc?.start.line})`);
        }

        if (this.isRequireDeniedModule(callExpr, deniedModules)) {
          const moduleName = this.getRequireModuleName(callExpr);
          errors.push(`require("${moduleName}") is not allowed (line ${callExpr.loc?.start.line})`);
        }

        if (this.isEvalCall(callExpr)) {
          errors.push(`eval() is not allowed (line ${callExpr.loc?.start.line})`);
        }

        if (this.isFunctionConstructor(callExpr)) {
          errors.push(`Function constructor is not allowed (line ${callExpr.loc?.start.line})`);
        }
      }

      if (node.type === "MemberExpression") {
        const memberExpr = node as MemberExpression;

        if (this.isProcessAccess(memberExpr, ["exit", "kill", "send", "disconnect", "pid"])) {
          const prop = this.getMemberProperty(memberExpr);
          errors.push(`process.${prop} access is not allowed (line ${memberExpr.loc?.start.line})`);
        }

        if (this.isConstructorAccess(memberExpr)) {
          errors.push(`Constructor access is not allowed (line ${memberExpr.loc?.start.line})`);
        }
      }

      if (node.type === "Identifier") {
        const ident = node as Identifier;
        if (deniedGlobalAccess.has(ident.name)) {
          errors.push(`${ident.name} access is not allowed (line ${ident.loc?.start.line})`);
        }
      }

      if (node.type === "ImportDeclaration") {
        const importDecl = node as unknown as { source: { value: string }; loc?: { start: { line: number } } };
        const source = importDecl.source.value;
        if (deniedModules.has(source)) {
          errors.push(`import from "${source}" is not allowed (line ${importDecl.loc?.start.line})`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  private walkAST(node: Node, visitor: (node: Node) => void): void {
    visitor(node);

    for (const key of Object.keys(node)) {
      const val = (node as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && item.type) {
            this.walkAST(item as Node, visitor);
          }
        }
      } else if (val && typeof val === "object" && (val as Record<string, unknown>).type) {
        this.walkAST(val as Node, visitor);
      }
    }
  }

  private isProcessExit(callExpr: CallExpression): boolean {
    const callee = callExpr.callee;
    if (callee.type !== "MemberExpression") return false;
    return this.isProcessAccess(callee as MemberExpression, ["exit"]);
  }

  private isRequireDeniedModule(callExpr: CallExpression, deniedModules: Set<string>): boolean {
    const callee = callExpr.callee;
    if (callee.type === "Identifier" && callee.name === "require") {
      const moduleName = this.getRequireModuleName(callExpr);
      if (moduleName && deniedModules.has(moduleName)) {
        return true;
      }
    }

    if (callee.type === "MemberExpression") {
      const obj = callee.object;
      const prop = callee.property;
      if (
        obj.type === "Identifier" && obj.name === "module" &&
        prop.type === "Identifier" && prop.name === "require"
      ) {
        const moduleName = this.getRequireModuleName(callExpr);
        if (moduleName && deniedModules.has(moduleName)) {
          return true;
        }
      }
    }

    return false;
  }

  private getRequireModuleName(callExpr: CallExpression): string | null {
    const args = callExpr.arguments;
    if (args.length === 0) return null;

    const firstArg = args[0];
    if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
      return firstArg.value;
    }

    if (firstArg.type === "TemplateLiteral" && firstArg.quasis.length === 1) {
      return firstArg.quasis[0]?.value.cooked ?? null;
    }

    return null;
  }

  private isEvalCall(callExpr: CallExpression): boolean {
    const callee = callExpr.callee;
    return callee.type === "Identifier" && callee.name === "eval";
  }

  private isFunctionConstructor(callExpr: CallExpression): boolean {
    const callee = callExpr.callee;
    if (callee.type !== "MemberExpression") return false;

    const obj = callee.object;
    const prop = callee.property;

    if (obj.type === "Identifier" && obj.name === "Function" && prop.type === "Identifier") {
      return true;
    }

    return false;
  }

  private isProcessAccess(memberExpr: MemberExpression, properties: string[]): boolean {
    const obj = memberExpr.object;
    const prop = memberExpr.property;

    if (obj.type === "Identifier" && obj.name === "process") {
      if (prop.type === "Identifier" && properties.includes(prop.name)) {
        return true;
      }
      if (prop.type === "Literal" && typeof prop.value === "string" && properties.includes(prop.value)) {
        return true;
      }
    }

    return false;
  }

  private getMemberProperty(memberExpr: MemberExpression): string {
    const prop = memberExpr.property;
    if (prop.type === "Identifier") return prop.name;
    if (prop.type === "Literal" && typeof prop.value === "string") return prop.value;
    return "unknown";
  }

  private isConstructorAccess(memberExpr: MemberExpression): boolean {
    const prop = memberExpr.property;
    if (prop.type === "Identifier" && prop.name === "constructor") {
      return true;
    }
    return false;
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

import type { ChatMessage, ToolCall, ToolDefinition } from "../ai/types.js";
import { logger } from "../utils/logger.js";
import { formatErrorMessage } from "../errors/errors.js";

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<string>;
}

export interface ToolInvokerConfig {
  maxConcurrentCalls: number;
  callTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_INVOKER_CONFIG: ToolInvokerConfig = {
  maxConcurrentCalls: 5,
  callTimeout: 30000,
  retryAttempts: 1,
  retryDelay: 1000,
};

export class ToolInvoker {
  private handlers: Map<string, ToolHandler> = new Map();
  private config: ToolInvokerConfig;

  constructor(config?: Partial<ToolInvokerConfig>) {
    this.config = { ...DEFAULT_INVOKER_CONFIG, ...config };
  }

  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
    logger.debug(`Registered tool: ${handler.name}`);
  }

  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  hasTool(name: string): boolean {
    return this.handlers.has(name);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.handlers.values()).map((handler) => ({
      type: "function" as const,
      function: {
        name: handler.name,
        description: handler.description,
        parameters: handler.parameters,
      },
    }));
  }

  getEnabledTools(allowed?: string[], denied?: string[]): ToolDefinition[] {
    let handlers = Array.from(this.handlers.values());

    if (allowed && allowed.length > 0) {
      handlers = handlers.filter((h) => allowed.includes(h.name));
    }

    if (denied && denied.length > 0) {
      handlers = handlers.filter((h) => !denied.includes(h.name));
    }

    return handlers.map((handler) => ({
      type: "function" as const,
      function: {
        name: handler.name,
        description: handler.description,
        parameters: handler.parameters,
      },
    }));
  }

  async invoke(toolCall: ToolCall): Promise<ChatMessage> {
    const { name, arguments: argsStr } = toolCall.function;

    const handler = this.handlers.get(name);
    if (!handler) {
      logger.warn(`Unknown tool called: ${name}`);
      return {
        role: "tool",
        content: `Error: Unknown tool "${name}"`,
        tool_call_id: toolCall.id,
        name,
      };
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      logger.error(`Failed to parse tool arguments for ${name}: ${argsStr}`);
      return {
        role: "tool",
        content: `Error: Invalid JSON arguments for tool "${name}"`,
        tool_call_id: toolCall.id,
        name,
      };
    }

    try {
      const result = await this.executeWithTimeout(handler, args);
      return {
        role: "tool",
        content: typeof result === "string" ? result : JSON.stringify(result),
        tool_call_id: toolCall.id,
        name,
      };
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      logger.error(`Tool execution error (${name}): ${errorMessage}`);
      return {
        role: "tool",
        content: `Error executing tool "${name}": ${errorMessage}`,
        tool_call_id: toolCall.id,
        name,
      };
    }
  }

  async invokeAll(toolCalls: ToolCall[]): Promise<ChatMessage[]> {
    const limitedCalls = toolCalls.slice(0, this.config.maxConcurrentCalls);

    const results = await Promise.all(limitedCalls.map((tc) => this.invoke(tc)));

    return results;
  }

  listTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  private async executeWithTimeout(
    handler: ToolHandler,
    args: Record<string, unknown>,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool "${handler.name}" timed out after ${this.config.callTimeout}ms`));
      }, this.config.callTimeout);

      handler
        .execute(args)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

import { type ZodObject, type ZodRawShape } from "zod";
import { logger } from "../utils/logger.js";

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: ZodObject<ZodRawShape>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  requiresApproval?: boolean;
  dangerous?: boolean;
  readOnly?: boolean;
}

export interface ToolRegistryConfig {
  allowByDefault: boolean;
  denyList: string[];
  allowList: string[];
  requireApprovalFor: string[];
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor(config?: Partial<ToolRegistryConfig>) {
    void config;
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool "${tool.name}" already registered, overwriting`);
    }

    this.tools.set(tool.name, tool);

    const categoryTools = this.categories.get(tool.category) ?? new Set();
    categoryTools.add(tool.name);
    this.categories.set(tool.category, categoryTools);

    logger.debug(`Registered tool: ${tool.name} [${tool.category}]`);
  }

  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);

    const categoryTools = this.categories.get(tool.category);
    if (categoryTools) {
      categoryTools.delete(name);
      if (categoryTools.size === 0) {
        this.categories.delete(tool.category);
      }
    }

    return true;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: string): ToolDefinition[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  listCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  getFilteredTools(
    allowed?: string[],
    denied?: string[],
    category?: string,
  ): ToolDefinition[] {
    let tools = this.listAll();

    if (category) {
      tools = tools.filter((t) => t.category === category);
    }

    if (allowed && allowed.length > 0) {
      tools = tools.filter((t) => allowed.includes(t.name));
    }

    if (denied && denied.length > 0) {
      tools = tools.filter((t) => !denied.includes(t.name));
    }

    return tools;
  }

  getToolsRequiringApproval(): ToolDefinition[] {
    return this.listAll().filter((t) => t.requiresApproval || t.dangerous);
  }

  getReadOnlyTools(): ToolDefinition[] {
    return this.listAll().filter((t) => t.readOnly === true);
  }

  validateArguments(name: string, args: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
    parsed?: Record<string, unknown>;
  } {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool "${name}" not found`] };
    }

    const result = tool.parameters.safeParse(args);
    if (result.success) {
      return { valid: true, parsed: result.data };
    }

    const errors = result.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`,
    );
    return { valid: false, errors };
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    const validation = this.validateArguments(name, args);
    if (!validation.valid) {
      throw new Error(`Invalid arguments for tool "${name}": ${validation.errors?.join(", ")}`);
    }

    return tool.execute(validation.parsed ?? args);
  }

  size(): number {
    return this.tools.size;
  }
}

export interface PolicyRule {
  name: string;
  type: "allow" | "deny" | "require_approval";
  toolPattern: string | string[];
  categoryPattern?: string;
  condition?: (context: PolicyContext) => boolean;
}

export interface PolicyContext {
  sessionId: string;
  toolName: string;
  toolCategory: string;
  args: Record<string, unknown>;
  isOwner: boolean;
}

export class ToolPolicyPipeline {
  private rules: PolicyRule[] = [];

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    logger.debug(`Added policy rule: ${rule.name} (${rule.type})`);
  }

  removeRule(name: string): boolean {
    const index = this.rules.findIndex((r) => r.name === name);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }

  evaluate(context: PolicyContext): {
    allowed: boolean;
    requiresApproval: boolean;
    deniedReason?: string;
  } {
    let allowed = true;
    let requiresApproval = false;

    for (const rule of this.rules) {
      if (!this.matchesRule(rule, context)) continue;

      if (rule.condition && !rule.condition(context)) continue;

      switch (rule.type) {
        case "deny":
          return {
            allowed: false,
            requiresApproval: false,
            deniedReason: `Denied by rule: ${rule.name}`,
          };
        case "require_approval":
          requiresApproval = true;
          break;
        case "allow":
          allowed = true;
          break;
      }
    }

    return { allowed, requiresApproval };
  }

  listRules(): PolicyRule[] {
    return [...this.rules];
  }

  private matchesRule(rule: PolicyRule, context: PolicyContext): boolean {
    const patterns = Array.isArray(rule.toolPattern)
      ? rule.toolPattern
      : [rule.toolPattern];

    const matchesTool = patterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.endsWith("*")) {
        return context.toolName.startsWith(pattern.slice(0, -1));
      }
      return context.toolName === pattern;
    });

    if (!matchesTool) return false;

    if (rule.categoryPattern) {
      const catPatterns = Array.isArray(rule.categoryPattern)
        ? rule.categoryPattern
        : [rule.categoryPattern];

      const matchesCategory = catPatterns.some((pattern) => {
        if (pattern === "*") return true;
        return context.toolCategory === pattern;
      });

      if (!matchesCategory) return false;
    }

    return true;
  }
}

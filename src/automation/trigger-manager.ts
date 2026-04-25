import type { TriggerRule, Event, EventHandler, EventPayload } from "./types.js";
import { EventBus } from "./event-bus.js";
import { logger } from "../utils/logger.js";

export type TriggerAction = (rule: TriggerRule, event: Event) => Promise<void>;

export class TriggerManager {
  private rules: Map<string, TriggerRule> = new Map();
  private eventBus: EventBus;
  private action: TriggerAction;
  private listenerIds: Map<string, string> = new Map();

  constructor(eventBus: EventBus, action: TriggerAction) {
    this.eventBus = eventBus;
    this.action = action;
  }

  addRule(rule: TriggerRule): void {
    this.rules.set(rule.id, rule);
    if (rule.enabled) {
      this.registerListener(rule);
    }
    logger.info(`Trigger rule added: ${rule.name} (${rule.id}), event: ${rule.eventName}`);
  }

  removeRule(ruleId: string): boolean {
    this.unregisterListener(ruleId);
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.info(`Trigger rule removed: ${ruleId}`);
    }
    return removed;
  }

  getRule(ruleId: string): TriggerRule | undefined {
    return this.rules.get(ruleId);
  }

  listRules(): TriggerRule[] {
    return Array.from(this.rules.values());
  }

  updateRule(ruleId: string, updates: Partial<TriggerRule>): TriggerRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const wasEnabled = rule.enabled;
    Object.assign(rule, updates, { updatedAt: Date.now() });

    if (wasEnabled && !rule.enabled) {
      this.unregisterListener(ruleId);
    } else if (!wasEnabled && rule.enabled) {
      this.registerListener(rule);
    } else if (wasEnabled && rule.enabled && updates.eventName) {
      this.unregisterListener(ruleId);
      this.registerListener(rule);
    }

    return rule;
  }

  enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    rule.enabled = true;
    rule.updatedAt = Date.now();
    this.registerListener(rule);
    return true;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    rule.enabled = false;
    rule.updatedAt = Date.now();
    this.unregisterListener(ruleId);
    return true;
  }

  private registerListener(rule: TriggerRule): void {
    if (this.listenerIds.has(rule.id)) return;

    const handler: EventHandler = async (event: Event) => {
      if (rule.condition) {
        try {
          const matches = this.evaluateCondition(rule.condition, event);
          if (!matches) return;
        } catch (error) {
          logger.error(`Trigger rule condition error for ${rule.id}: ${error}`);
          return;
        }
      }

      try {
        await this.action(rule, event);
      } catch (error) {
        logger.error(`Trigger rule action error for ${rule.id}: ${error}`);
      }
    };

    const listenerId = this.eventBus.on(rule.eventName, handler);
    this.listenerIds.set(rule.id, listenerId);
  }

  private unregisterListener(ruleId: string): void {
    const listenerId = this.listenerIds.get(ruleId);
    if (listenerId) {
      this.eventBus.off(listenerId);
      this.listenerIds.delete(ruleId);
    }
  }

  private evaluateCondition(condition: string, event: Event): boolean {
    const payload = event.payload;
    try {
      return this.safeEvaluate(condition, payload, event);
    } catch {
      logger.debug(`Trigger condition evaluation failed: ${condition}`);
      return false;
    }
  }

  private safeEvaluate(condition: string, payload: EventPayload, event: Event): boolean {
    const tokens = this.tokenize(condition);
    return this.parseOr(tokens, payload, event);
  }

  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let i = 0;

    while (i < expr.length) {
      const ch = expr[i];

      if (ch === " " || ch === "\t") {
        if (current) {
          tokens.push(current);
          current = "";
        }
        i++;
        continue;
      }

      if (ch === "(" || ch === ")" || ch === ",") {
        if (current) {
          tokens.push(current);
          current = "";
        }
        tokens.push(ch);
        i++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        if (current) {
          tokens.push(current);
          current = "";
        }
        const quote = ch;
        i++;
        let str = "";
        while (i < expr.length && expr[i] !== quote) {
          if (expr[i] === "\\" && i + 1 < expr.length) {
            str += expr[i + 1];
            i += 2;
          } else {
            str += expr[i];
            i++;
          }
        }
        i++;
        tokens.push(`__str:${str}`);
        continue;
      }

      current += ch;
      i++;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private parseOr(tokens: string[], payload: EventPayload, event: Event): boolean {
    let result = this.parseAnd(tokens, payload, event);
    while (tokens.length > 0 && tokens[0] === "||") {
      tokens.shift();
      const right = this.parseAnd(tokens, payload, event);
      result = result || right;
    }
    return result;
  }

  private parseAnd(tokens: string[], payload: EventPayload, event: Event): boolean {
    let result = this.parseComparison(tokens, payload, event);
    while (tokens.length > 0 && tokens[0] === "&&") {
      tokens.shift();
      const right = this.parseComparison(tokens, payload, event);
      result = result && right;
    }
    return result;
  }

  private parseComparison(tokens: string[], payload: EventPayload, event: Event): boolean {
    if (tokens.length > 0 && tokens[0] === "(") {
      tokens.shift();
      const result = this.parseOr(tokens, payload, event);
      const next = tokens.shift();
      if (next !== ")") {
        if (next !== undefined) tokens.unshift(next);
      }
      return result;
    }

    if (tokens.length > 0 && tokens[0] === "!") {
      tokens.shift();
      return !this.parseComparison(tokens, payload, event);
    }

    const left = this.resolveValue(tokens, payload, event);
    if (tokens.length === 0) {
      return Boolean(left);
    }

    const op = tokens.shift();
    if (!op) return Boolean(left);

    const comparisonOps = new Set(["==", "!=", "===", "!==", ">", ">=", "<", "<="]);
    if (!comparisonOps.has(op)) {
      return Boolean(left);
    }

    const right = this.resolveValue(tokens, payload, event);

    switch (op) {
      case "==":
      case "===":
        return left === right;
      case "!=":
      case "!==":
        return left !== right;
      case ">":
        return (left as number) > (right as number);
      case ">=":
        return (left as number) >= (right as number);
      case "<":
        return (left as number) < (right as number);
      case "<=":
        return (left as number) <= (right as number);
      default:
        return false;
    }
  }

  private resolveValue(tokens: string[], payload: EventPayload, event: Event): unknown {
    if (tokens.length === 0) return undefined;

    const token = tokens.shift()!;
    if (!token) return undefined;

    if (token.startsWith("__str:")) {
      return token.slice(6);
    }

    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    if (token === "undefined") return undefined;

    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return Number(token);
    }

    if (token === "payload" || token === "event") {
      const obj = token === "payload" ? payload : event;
      if (tokens.length > 0 && tokens[0] === ".") {
        tokens.shift();
        return this.resolveProperty(obj, tokens);
      }
      return obj;
    }

    return undefined;
  }

  private resolveProperty(obj: unknown, tokens: string[]): unknown {
    if (obj === null || obj === undefined) return undefined;

    const propName = tokens.shift();
    if (!propName) return obj;

    const record = obj as Record<string, unknown>;
    const value = record[propName];

    if (tokens.length > 0 && tokens[0] === ".") {
      tokens.shift();
      return this.resolveProperty(value, tokens);
    }

    if (tokens.length > 0 && tokens[0] === "[") {
      tokens.shift();
      const indexStr = tokens.shift();
      const closing = tokens.shift();
      if (closing !== "]") {
        if (closing !== undefined) tokens.unshift(closing);
      }
      const index = Number(indexStr);
      if (Array.isArray(value) && !isNaN(index)) {
        return value[index];
      }
    }

    return value;
  }

  start(): void {
    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        this.registerListener(rule);
      }
    }
    logger.info(`Trigger manager started with ${this.rules.size} rules`);
  }

  stop(): void {
    for (const ruleId of this.listenerIds.keys()) {
      this.unregisterListener(ruleId);
    }
    logger.info("Trigger manager stopped");
  }
}

import type { TriggerRule, Event, EventHandler } from "./types.js";
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
      const fn = new Function("payload", "event", `return (${condition})`);
      return Boolean(fn(payload, event));
    } catch {
      return false;
    }
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

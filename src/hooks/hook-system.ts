import type { ChatMessage } from "../ai/types.js";
import type { CompactionResult } from "../memory/compactor.js";

export type HookPhase = "pre_chat" | "post_chat" | "pre_tool" | "post_tool" | "pre_compaction" | "post_compaction" | "on_error";

export interface HookContext {
  sessionId: string;
  messages: ChatMessage[];
  currentTurn: number;
  totalTokens: number;
  metadata: Record<string, unknown>;
}

export interface CompactionHookContext extends HookContext {
  compactionResult?: CompactionResult;
}

export interface ToolHookContext extends HookContext {
  toolName: string;
  toolArguments: Record<string, unknown>;
  toolResult?: string;
}

export interface HookResult {
  modified: boolean;
  messages?: ChatMessage[];
  metadata?: Record<string, unknown>;
  skip?: boolean;
  injectSystemMessage?: string;
}

export interface Hook {
  name: string;
  phase: HookPhase;
  priority: number;
  execute(context: HookContext): Promise<HookResult>;
}

const NO_CHANGE: HookResult = { modified: false };

export class HookSystem {
  private hooks: Map<HookPhase, Hook[]> = new Map();

  register(hook: Hook): void {
    const phaseHooks = this.hooks.get(hook.phase) ?? [];
    phaseHooks.push(hook);
    phaseHooks.sort((a, b) => b.priority - a.priority);
    this.hooks.set(hook.phase, phaseHooks);
  }

  unregister(name: string, phase?: HookPhase): boolean {
    if (phase) {
      const phaseHooks = this.hooks.get(phase);
      if (!phaseHooks) return false;
      const index = phaseHooks.findIndex((h) => h.name === name);
      if (index === -1) return false;
      phaseHooks.splice(index, 1);
      return true;
    }

    let removed = false;
    for (const [, hooks] of this.hooks.entries()) {
      const index = hooks.findIndex((h) => h.name === name);
      if (index !== -1) {
        hooks.splice(index, 1);
        removed = true;
      }
    }
    return removed;
  }

  async execute(phase: HookPhase, context: HookContext): Promise<HookContext> {
    const phaseHooks = this.hooks.get(phase);
    if (!phaseHooks || phaseHooks.length === 0) return context;

    let currentContext = { ...context };

    for (const hook of phaseHooks) {
      try {
        const result = await hook.execute(currentContext);

        if (result.skip) {
          break;
        }

        if (result.modified) {
          if (result.messages) {
            currentContext.messages = result.messages;
          }
          if (result.metadata) {
            currentContext.metadata = { ...currentContext.metadata, ...result.metadata };
          }
          if (result.injectSystemMessage) {
            currentContext.messages = [
              { role: "system", content: result.injectSystemMessage },
              ...currentContext.messages,
            ];
          }
        }
      } catch (error) {
        console.error(`Hook "${hook.name}" error in phase "${phase}": ${error}`);
      }
    }

    return currentContext;
  }

  listHooks(phase?: HookPhase): Array<{ name: string; phase: HookPhase; priority: number }> {
    if (phase) {
      return (this.hooks.get(phase) ?? []).map((h) => ({
        name: h.name,
        phase: h.phase,
        priority: h.priority,
      }));
    }

    const all: Array<{ name: string; phase: HookPhase; priority: number }> = [];
    for (const [p, hooks] of this.hooks.entries()) {
      for (const hook of hooks) {
        all.push({ name: hook.name, phase: p, priority: hook.priority });
      }
    }
    return all;
  }

  clear(phase?: HookPhase): void {
    if (phase) {
      this.hooks.delete(phase);
    } else {
      this.hooks.clear();
    }
  }
}

export class CompactionHook implements Hook {
  name = "compaction_hook";
  phase: HookPhase = "post_compaction";
  priority = 100;

  async execute(context: HookContext): Promise<HookResult> {
    const compactionCtx = context as CompactionHookContext;
    if (!compactionCtx.compactionResult) return NO_CHANGE;

    const { summary, tokensSaved } = compactionCtx.compactionResult;

    return {
      modified: true,
      injectSystemMessage: `[Context was compacted. ${tokensSaved} tokens saved. Summary: ${summary.slice(0, 500)}]`,
    };
  }
}

export class BootGuidanceHook implements Hook {
  name = "boot_guidance_hook";
  phase: HookPhase = "pre_chat";
  priority = 50;
  private guidanceMessage: string;

  constructor(guidanceMessage: string) {
    this.guidanceMessage = guidanceMessage;
  }

  async execute(context: HookContext): Promise<HookResult> {
    if (context.currentTurn > 0) return NO_CHANGE;

    return {
      modified: true,
      injectSystemMessage: this.guidanceMessage,
    };
  }
}

export class MemoryGuidanceHook implements Hook {
  name = "memory_guidance_hook";
  phase: HookPhase = "pre_chat";
  priority = 40;
  private memorySummary: string;

  constructor(memorySummary: string) {
    this.memorySummary = memorySummary;
  }

  updateSummary(summary: string): void {
    this.memorySummary = summary;
  }

  async execute(_context: HookContext): Promise<HookResult> {
    if (!this.memorySummary) return NO_CHANGE;

    return {
      modified: true,
      injectSystemMessage: `[Relevant memories]\n${this.memorySummary}`,
    };
  }
}

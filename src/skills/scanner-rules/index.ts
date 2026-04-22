import type { SignatureRule, SignatureRuleCategory, RuleSetResult } from "./types.js";
import { getCommandInjectionRules } from "./command-injection.js";
import { getPromptInjectionRules } from "./prompt-injection.js";
import { getDataLeakageRules } from "./data-leakage.js";
import { getObfuscationRules } from "./obfuscation.js";
import { getPrivilegeEscalationRules } from "./privilege-escalation.js";
import { getResourceAbuseRules } from "./resource-abuse.js";

const RULE_SET_LOADERS: Record<SignatureRuleCategory, () => RuleSetResult> = {
  "command-injection": getCommandInjectionRules,
  "prompt-injection": getPromptInjectionRules,
  "data-leakage": getDataLeakageRules,
  "obfuscation": getObfuscationRules,
  "privilege-escalation": getPrivilegeEscalationRules,
  "resource-abuse": getResourceAbuseRules,
};

export function getAllRules(): SignatureRule[] {
  const rules: SignatureRule[] = [];
  for (const loader of Object.values(RULE_SET_LOADERS)) {
    const result = loader();
    rules.push(...result.rules);
  }
  return rules;
}

export function getRulesByCategory(category: SignatureRuleCategory): SignatureRule[] {
  const loader = RULE_SET_LOADERS[category];
  if (!loader) return [];
  return loader().rules;
}

export function getRulesBySeverity(minSeverity: "info" | "low" | "medium" | "high" | "critical"): SignatureRule[] {
  const severityOrder: Array<"info" | "low" | "medium" | "high" | "critical"> = ["info", "low", "medium", "high", "critical"];
  const minIndex = severityOrder.indexOf(minSeverity);

  return getAllRules().filter((rule) => {
    const ruleIndex = severityOrder.indexOf(rule.severity);
    return ruleIndex >= minIndex;
  });
}

export function getRuleCategories(): SignatureRuleCategory[] {
  return Object.keys(RULE_SET_LOADERS) as SignatureRuleCategory[];
}

export function getRuleSetSummary(): Record<SignatureRuleCategory, number> {
  const summary = {} as Record<SignatureRuleCategory, number>;
  for (const [category, loader] of Object.entries(RULE_SET_LOADERS)) {
    summary[category as SignatureRuleCategory] = loader().count;
  }
  return summary;
}

export type { SignatureRule, SignatureRuleCategory, RuleSetResult } from "./types.js";

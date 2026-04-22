import type { ScanSeverity } from "../types.js";

export interface SignatureRule {
  id: string;
  category: SignatureRuleCategory;
  severity: ScanSeverity;
  pattern: RegExp;
  message: string;
  description: string;
  remediation: string;
}

export type SignatureRuleCategory = "command-injection" | "prompt-injection" | "data-leakage" | "obfuscation" | "privilege-escalation" | "resource-abuse";

export interface RuleSetResult {
  rules: SignatureRule[];
  category: SignatureRuleCategory;
  count: number;
}

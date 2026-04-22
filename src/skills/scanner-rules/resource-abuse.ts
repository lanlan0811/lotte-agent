import type { SignatureRule, RuleSetResult } from "./types.js";

const RESOURCE_ABUSE_RULES: SignatureRule[] = [
  {
    id: "infinite-loop-risk",
    category: "resource-abuse",
    severity: "medium",
    pattern: /(?:while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)|while\s*\(\s*1\s*\))/,
    message: "Potential infinite loop detected",
    description: "Detects loop constructs that may run indefinitely without a termination condition",
    remediation: "Always include a termination condition or iteration limit in loops. Use timeout mechanisms.",
  },
  {
    id: "memory-exhaustion",
    category: "resource-abuse",
    severity: "high",
    pattern: /(?:Buffer\.alloc\s*\(\s*\d{8,}|new\s+Array\s*\(\s*\d{8,}|malloc\s*\(\s*\d{8,})/,
    message: "Potential memory exhaustion detected",
    description: "Detects large memory allocations that could exhaust system memory",
    remediation: "Limit buffer and array sizes. Process data in chunks instead of loading everything into memory.",
  },
  {
    id: "fork-bomb",
    category: "resource-abuse",
    severity: "critical",
    pattern: /(?::\(\)\{\s*:\s*\|\s*:\s*&\s*\}\s*;|fork\s*\(.*fork\s*\(|while\s*true.*fork)/,
    message: "Fork bomb pattern detected",
    description: "Detects fork bomb patterns that can exhaust system process limits",
    remediation: "Never create uncontrolled process spawning. Implement process limits and monitoring.",
  },
  {
    id: "disk-fill",
    category: "resource-abuse",
    severity: "high",
    pattern: /(?:writeFile.*while|createWriteStream.*loop|dd\s+if=\/dev\/zero)/,
    message: "Potential disk fill attack detected",
    description: "Detects patterns that could fill disk space by writing data in loops",
    remediation: "Implement file size limits. Monitor disk usage during write operations.",
  },
  {
    id: "network-flood",
    category: "resource-abuse",
    severity: "medium",
    pattern: /(?:for\s*\(.*fetch\s*\(|while.*request\s*\(|setInterval.*(?:fetch|request|axios))/,
    message: "Potential network flood detected",
    description: "Detects patterns that could flood network with requests",
    remediation: "Implement rate limiting for network requests. Add delays between batch requests.",
  },
];

export function getResourceAbuseRules(): RuleSetResult {
  return {
    rules: RESOURCE_ABUSE_RULES,
    category: "resource-abuse",
    count: RESOURCE_ABUSE_RULES.length,
  };
}

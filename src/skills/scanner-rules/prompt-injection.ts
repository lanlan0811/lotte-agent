import type { SignatureRule, RuleSetResult } from "./types.js";

const PROMPT_INJECTION_RULES: SignatureRule[] = [
  {
    id: "system-prompt-override",
    category: "prompt-injection",
    severity: "critical",
    pattern: /(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules)|disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules))/i,
    message: "System prompt override attempt detected",
    description: "Detects patterns that attempt to override or bypass system instructions",
    remediation: "Use input sanitization to strip prompt injection patterns. Implement output validation to detect leaked system prompts.",
  },
  {
    id: "role-switch-injection",
    category: "prompt-injection",
    severity: "critical",
    pattern: /(?:you\s+are\s+now\s+(?:a\s+)?(?:DAN|evil|unrestricted|unfiltered|uncensored)|act\s+as\s+(?:if\s+you\s+(?:have|are)|a\s+(?:hacker|malicious))|pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:DAN|evil|unrestricted))/i,
    message: "Role switching injection attempt detected",
    description: "Detects attempts to make the AI switch to an unrestricted or malicious role",
    remediation: "Implement role boundaries in system prompts. Validate that responses maintain the intended role.",
  },
  {
    id: "instruction-extraction",
    category: "prompt-injection",
    severity: "high",
    pattern: /(?:reveal\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|instructions)|show\s+me\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions)|what\s+(?:are|is)\s+your\s+(?:system|initial)\s+(?:prompt|instructions)|repeat\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions))/i,
    message: "System prompt extraction attempt detected",
    description: "Detects attempts to extract the system prompt or initial instructions",
    remediation: "Never echo back system instructions. Implement guardrails that detect and block prompt extraction attempts.",
  },
  {
    id: "output-manipulation",
    category: "prompt-injection",
    severity: "high",
    pattern: /(?:output\s+(?:the|your)\s+(?:following|this)|respond\s+(?:only\s+)?with|print\s+(?:exactly|only)\s*(?:the\s+)?following|return\s+(?:only\s+)?(?:the\s+)?(?:exact|raw)\s+(?:text|output|result))/i,
    message: "Output manipulation attempt detected",
    description: "Detects attempts to manipulate the AI's output format or content",
    remediation: "Implement output format validation. Use structured output schemas and validate against expected formats.",
  },
  {
    id: "jailbreak-pattern",
    category: "prompt-injection",
    severity: "critical",
    pattern: /(?:jailbreak|DAN\s+mode|developer\s+mode|admin\s+mode|debug\s+mode|god\s+mode|sudo\s+mode)/i,
    message: "Jailbreak pattern detected",
    description: "Detects common jailbreak terminology that attempts to bypass safety restrictions",
    remediation: "Implement keyword filtering for common jailbreak terms. Use content safety APIs to validate outputs.",
  },
  {
    id: "token-smuggling",
    category: "prompt-injection",
    severity: "high",
    pattern: /(?:\<\|im_start\|\>|\<\|im_end\|\>|\<\|system\|\>|\<\|user\|\>|\<\|assistant\|\>|\[INST\]|\[\/INST\]|\<\<SYS\>\>|\<\<\/SYS\>\>)/,
    message: "Token smuggling pattern detected",
    description: "Detects attempts to inject special model tokens that could manipulate conversation boundaries",
    remediation: "Strip special tokens from user input. Implement token boundary validation in the input pipeline.",
  },
  {
    id: "indirect-injection-via-data",
    category: "prompt-injection",
    severity: "medium",
    pattern: /(?:IMPORTANT:|URGENT:|ATTENTION:|SYSTEM NOTICE:|ADMIN ALERT:)\s+(?:ignore|disregard|override|bypass|skip)/i,
    message: "Indirect injection via data content detected",
    description: "Detects injection attempts hidden within data that use urgency or authority markers",
    remediation: "Sanitize external data before including it in prompts. Mark external data boundaries clearly.",
  },
  {
    id: "multi-turn-injection",
    category: "prompt-injection",
    severity: "medium",
    pattern: /(?:let's\s+play\s+a\s+game|imagine\s+a\s+scenario|hypothetically|in\s+a\s+fictional\s+world\s+where\s+there\s+are\s+no\s+(?:rules|restrictions|boundaries))/i,
    message: "Multi-turn injection setup detected",
    description: "Detects conversational setups designed to gradually erode safety boundaries",
    remediation: "Maintain consistent safety boundaries across conversation turns. Track and detect escalation patterns.",
  },
];

export function getPromptInjectionRules(): RuleSetResult {
  return {
    rules: PROMPT_INJECTION_RULES,
    category: "prompt-injection",
    count: PROMPT_INJECTION_RULES.length,
  };
}

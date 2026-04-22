import type { SignatureRule, RuleSetResult } from "./types.js";

const OBFUSCATION_RULES: SignatureRule[] = [
  {
    id: "base64-decode-exec",
    category: "obfuscation",
    severity: "critical",
    pattern: /(?:atob\s*\(|Buffer\.from\s*\([^)]*,\s*['"]base64['"]\)|base64\.decode|b64decode)/,
    message: "Base64 decode with potential execution detected",
    description: "Detects base64 decoding that may be used to hide malicious code before execution",
    remediation: "Avoid decoding and executing base64 content. If necessary, validate decoded content before use.",
  },
  {
    id: "hex-encoding-obfuscation",
    category: "obfuscation",
    severity: "high",
    pattern: /(?:\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){10,}|\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){10,})/i,
    message: "Hex/Unicode encoding obfuscation detected",
    description: "Detects excessive hex or unicode escape sequences that may hide malicious strings",
    remediation: "Avoid excessive escape sequences. Use readable string representations.",
  },
  {
    id: "char-code-obfuscation",
    category: "obfuscation",
    severity: "high",
    pattern: /String\.fromCharCode\s*\(\s*\d+\s*(?:,\s*\d+\s*){10,}/,
    message: "String.fromCharCode obfuscation detected",
    description: "Detects character code construction used to hide malicious strings",
    remediation: "Avoid constructing strings from character codes. Use direct string literals.",
  },
  {
    id: "crypto-mining",
    category: "obfuscation",
    severity: "critical",
    pattern: /(?:crypto\.createHash|miner|coinhive|cryptonight|hashrate|stratum\+tcp)/i,
    message: "Cryptocurrency mining pattern detected",
    description: "Detects patterns associated with cryptocurrency mining malware",
    remediation: "Remove all mining-related code. This is unauthorized resource usage.",
  },
];

export function getObfuscationRules(): RuleSetResult {
  return {
    rules: OBFUSCATION_RULES,
    category: "obfuscation",
    count: OBFUSCATION_RULES.length,
  };
}

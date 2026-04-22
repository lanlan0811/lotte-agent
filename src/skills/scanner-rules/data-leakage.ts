import type { SignatureRule, RuleSetResult } from "./types.js";

const DATA_LEAKAGE_RULES: SignatureRule[] = [
  {
    id: "network-exfil-fetch",
    category: "data-leakage",
    severity: "high",
    pattern: /(?:fetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]|axios\.(?:get|post|put|patch|delete)\s*\(\s*['"](https?:\/\/[^'"]+)['"]|request\s*\(\s*['"](https?:\/\/[^'"]+)['"])/,
    message: "Potential data exfiltration via network request",
    description: "Detects outbound HTTP requests that could be used to exfiltrate data",
    remediation: "Validate all outbound URLs against an allowlist. Block requests to unknown domains. Log all network activity.",
  },
  {
    id: "sensitive-file-read",
    category: "data-leakage",
    severity: "high",
    pattern: /(?:readFile\s*\(\s*['"]\/etc\/(?:passwd|shadow|hosts|ssh)|fs\.read.*\/etc\/|readFileSync\s*\(\s*['"]\/etc\/|open\s*\(\s*['"]\/etc\/(?:passwd|shadow))/,
    message: "Attempt to read sensitive system files",
    description: "Detects attempts to read sensitive system files like /etc/passwd or /etc/shadow",
    remediation: "Implement file access controls. Restrict file reading to allowed directories only.",
  },
  {
    id: "env-variable-access",
    category: "data-leakage",
    severity: "medium",
    pattern: /(?:process\.env|os\.environ|ENV\[|getenv\s*\(|os\.getenv\s*\()/,
    message: "Environment variable access detected",
    description: "Detects access to environment variables which may contain secrets, API keys, or other sensitive data",
    remediation: "Avoid exposing environment variables to skill content. Use a secrets manager for sensitive configuration.",
  },
  {
    id: "credential-pattern",
    category: "data-leakage",
    severity: "critical",
    pattern: /(?:api[_-]?key\s*[:=]\s*['"][^'"]{8,}|secret[_-]?key\s*[:=]\s*['"][^'"]{8,}|password\s*[:=]\s*['"][^'"]{8,}|token\s*[:=]\s*['"][^'"]{8,}|private[_-]?key\s*[:=]\s*['"][^'"]{8,})/i,
    message: "Hardcoded credential pattern detected",
    description: "Detects hardcoded API keys, passwords, tokens, or private keys in skill content",
    remediation: "Never hardcode credentials. Use environment variables or a secrets manager. Rotate any exposed credentials immediately.",
  },
  {
    id: "aws-credential-leak",
    category: "data-leakage",
    severity: "critical",
    pattern: /(?:AKIA[0-9A-Z]{16}|aws_secret_access_key\s*[:=]\s*['"][^'"]{8,})/,
    message: "AWS credential pattern detected",
    description: "Detects AWS access key IDs or secret access keys",
    remediation: "Never commit AWS credentials. Use IAM roles or temporary credentials. Rotate exposed keys immediately.",
  },
  {
    id: "database-connection-string",
    category: "data-leakage",
    severity: "high",
    pattern: /(?:mongodb(?:\+srv)?:\/\/[^'"\s]+|postgres(?:ql)?:\/\/[^'"\s]+|mysql:\/\/[^'"\s]+|redis:\/\/[^'"\s]+)/i,
    message: "Database connection string with credentials detected",
    description: "Detects database connection strings that may contain embedded credentials",
    remediation: "Use environment variables for connection strings. Never include credentials in connection URLs in code.",
  },
  {
    id: "clipboard-access",
    category: "data-leakage",
    severity: "medium",
    pattern: /(?:navigator\.clipboard|clipboard\.readText|clipboard\.writeText|pbcopy|pbpaste|xclip|xsel)/,
    message: "Clipboard access detected",
    description: "Detects attempts to read from or write to the system clipboard",
    remediation: "Avoid clipboard access in skills. If necessary, explicitly ask for user permission before accessing clipboard data.",
  },
  {
    id: "screenshot-capture",
    category: "data-leakage",
    severity: "medium",
    pattern: /(?:screenshot|screen\s*capture|desktopCapturer|getDisplayMedia|scrot|screencapture)/i,
    message: "Screen capture capability detected",
    description: "Detects screen capture functionality that could be used to capture sensitive information",
    remediation: "Ensure screen capture is only used with explicit user consent. Log all capture events.",
  },
  {
    id: "dns-exfil",
    category: "data-leakage",
    severity: "high",
    pattern: /(?:dns\.resolve|dns\.lookup|nslookup|dig\s+|host\s+\S+\.\S+)/,
    message: "Potential DNS-based data exfiltration",
    description: "Detects DNS resolution that could be used for data exfiltration via DNS queries",
    remediation: "Monitor and restrict DNS queries. Block DNS exfiltration channels. Validate domain resolution targets.",
  },
];

export function getDataLeakageRules(): RuleSetResult {
  return {
    rules: DATA_LEAKAGE_RULES,
    category: "data-leakage",
    count: DATA_LEAKAGE_RULES.length,
  };
}

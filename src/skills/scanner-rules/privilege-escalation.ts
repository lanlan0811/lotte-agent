import type { SignatureRule, RuleSetResult } from "./types.js";

const PRIVILEGE_ESCALATION_RULES: SignatureRule[] = [
  {
    id: "path-traversal",
    category: "privilege-escalation",
    severity: "high",
    pattern: /(?:\.\.[\\/]\.\.[\\/]|path\.join\s*\(\s*['"]\.\.|\/\.\.\/|\\\.\.\\)/,
    message: "Path traversal pattern detected",
    description: "Detects directory traversal attempts that could access files outside intended directories",
    remediation: "Validate and normalize all file paths. Use path.resolve() and check that resolved paths are within allowed directories.",
  },
  {
    id: "sudo-escalation",
    category: "privilege-escalation",
    severity: "critical",
    pattern: /(?:sudo\s+|runas\s+|su\s+-|pkexec|gksudo|kdesudo)/,
    message: "Privilege escalation via sudo/runas detected",
    description: "Detects attempts to execute commands with elevated privileges",
    remediation: "Never use sudo or privilege escalation in skills. Design skills to work with minimal required permissions.",
  },
  {
    id: "file-permission-change",
    category: "privilege-escalation",
    severity: "high",
    pattern: /(?:chmod\s+[0-7]{3,4}|chown\s+|chgrp\s+|icacls\s+|attrib\s+)/,
    message: "File permission modification detected",
    description: "Detects attempts to change file permissions or ownership",
    remediation: "Avoid modifying file permissions in skills. If necessary, restrict to the skill's own files only.",
  },
  {
    id: "cron-persistence",
    category: "privilege-escalation",
    severity: "high",
    pattern: /(?:crontab\s+-|\/etc\/cron\.|cron\.d\/|schtasks\s+\/create|launchctl\s+load)/,
    message: "Persistence mechanism via cron/scheduled task detected",
    description: "Detects creation of cron jobs or scheduled tasks that could provide persistence",
    remediation: "Do not create system-level scheduled tasks from skills. Use the application's built-in scheduling mechanism.",
  },
];

export function getPrivilegeEscalationRules(): RuleSetResult {
  return {
    rules: PRIVILEGE_ESCALATION_RULES,
    category: "privilege-escalation",
    count: PRIVILEGE_ESCALATION_RULES.length,
  };
}

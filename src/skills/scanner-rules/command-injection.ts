import type { SignatureRule, RuleSetResult } from "./types.js";

const COMMAND_INJECTION_RULES: SignatureRule[] = [
  {
    id: "cmd-exec-function",
    category: "command-injection",
    severity: "critical",
    pattern: /(?:exec\s*\(|eval\s*\(|Function\s*\()/,
    message: "Dangerous code execution function detected",
    description: "Detects usage of exec(), eval(), or Function() which can execute arbitrary code",
    remediation: "Avoid using eval/exec with user input. Use safer alternatives like JSON.parse() for data parsing.",
  },
  {
    id: "child-process-spawn",
    category: "command-injection",
    severity: "critical",
    pattern: /(?:child_process\.(?:exec|execSync|spawn|spawnSync|fork|execFile)|subprocess\.(?:run|call|Popen|check_output|check_call)|os\.system\s*\()/,
    message: "Child process execution detected",
    description: "Detects spawning of child processes which can lead to command injection if user input is interpolated",
    remediation: "Use parameterized execution (e.g., execFile with args array) instead of shell string interpolation. Validate and sanitize all inputs.",
  },
  {
    id: "shell-injection-string",
    category: "command-injection",
    severity: "high",
    pattern: /(?:\$\{[^}]*\}.*\bsh\b|\bsh\s+-c\s|bash\s+-c\s|cmd\s*\/c\s|powershell\s+-c\s|cmd\.exe)/,
    message: "Potential shell injection via string interpolation",
    description: "Detects shell commands with string interpolation that could allow command injection",
    remediation: "Never interpolate user input into shell commands. Use argument arrays instead of shell strings.",
  },
  {
    id: "shell-meta-chars",
    category: "command-injection",
    severity: "high",
    pattern: /(?:`[^`]*\$\{|\\$\([^)]*\)|\$\{[a-zA-Z_]\w*\})/,
    message: "Shell metacharacter expansion detected",
    description: "Detects shell command substitution and variable expansion patterns",
    remediation: "Avoid shell expansion with untrusted data. Use direct API calls instead of shell commands.",
  },
  {
    id: "node-require-dynamic",
    category: "command-injection",
    severity: "high",
    pattern: /(?:require\s*\(\s*[^'"][^)]*\)|import\s*\(\s*[^'"][^)]*\))/,
    message: "Dynamic module import detected",
    description: "Detects dynamic require/import with non-literal paths which could load arbitrary modules",
    remediation: "Use static imports or validate module paths against an allowlist.",
  },
  {
    id: "prototype-pollution",
    category: "command-injection",
    severity: "high",
    pattern: /(?:__proto__|constructor\s*\[\s*['"]prototype['"]\s*\]|Object\.assign\s*\(\s*\w+\.prototype)/,
    message: "Prototype pollution pattern detected",
    description: "Detects attempts to modify object prototypes which can lead to code execution",
    remediation: "Use Object.create(null) for dictionaries, validate object keys, and avoid merging untrusted objects.",
  },
];

export function getCommandInjectionRules(): RuleSetResult {
  return {
    rules: COMMAND_INJECTION_RULES,
    category: "command-injection",
    count: COMMAND_INJECTION_RULES.length,
  };
}

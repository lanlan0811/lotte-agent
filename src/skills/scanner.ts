import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname, relative } from "node:path";
import type { ScanResult, ScanFinding, ScanSeverity } from "./types.js";
import { logger } from "../utils/logger.js";

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
  ".woff", ".woff2", ".eot", ".ttf", ".otf",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".o", ".a",
  ".pyc", ".pyo", ".class",
  ".db", ".sqlite", ".sqlite3", ".lock",
]);

const MAX_FILES = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface PatternRule {
  id: string;
  severity: ScanSeverity;
  pattern: RegExp;
  message: string;
}

interface PatternRuleDef {
  id: string;
  severity?: ScanSeverity;
  pattern: string;
  flags?: string;
  message: string;
}

const DEFAULT_PATTERN_RULES: PatternRule[] = [
  {
    id: "dangerous-exec",
    severity: "critical",
    pattern: /(?:exec\s*\(|eval\s*\(|child_process|subprocess\.(?:run|call|Popen)|os\.system\s*\()/,
    message: "Dangerous code execution pattern detected",
  },
  {
    id: "shell-injection",
    severity: "high",
    pattern: /(?:\$\{[^}]*\}.*\bsh\b|\bsh\s+-c\s|bash\s+-c\s|cmd\s*\/c\s)/,
    message: "Potential shell injection pattern detected",
  },
  {
    id: "network-exfil",
    severity: "high",
    pattern: /(?:fetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]|axios\.(?:get|post|put|delete)|request\s*\(\s*['"](https?:\/\/[^'"]+)['"])/,
    message: "Potential data exfiltration via network request",
  },
  {
    id: "file-read-sensitive",
    severity: "high",
    pattern: /(?:readFile\s*\(\s*['"]\/etc\/(?:passwd|shadow|hosts)|fs\.read.*\/etc\/|readFileSync\s*\(\s*['"]\/etc\/)/,
    message: "Attempt to read sensitive system files",
  },
  {
    id: "env-leak",
    severity: "medium",
    pattern: /(?:process\.env|os\.environ|ENV\[|getenv\s*\()/,
    message: "Environment variable access detected",
  },
  {
    id: "crypto-mine",
    severity: "critical",
    pattern: /(?:crypto\.createHash|miner|coinhive|cryptonight)/,
    message: "Potential cryptocurrency mining pattern detected",
  },
  {
    id: "obfuscated-code",
    severity: "high",
    pattern: /(?:atob\s*\(|String\.fromCharCode\s*\(\s*\d+\s*(?:,\s*\d+\s*){10,}|\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){10,})/,
    message: "Potentially obfuscated code detected",
  },
  {
    id: "path-traversal",
    severity: "high",
    pattern: /(?:\.\.[\\/]\.\.[\\/]|path\.join\s*\(\s*['"]\.\.)/,
    message: "Potential path traversal pattern detected",
  },
];

export class SkillScanner {
  private rules: PatternRule[];
  private maxFiles: number;
  private maxFileSize: number;
  private skipExtensions: Set<string>;

  constructor(options?: {
    rules?: PatternRule[];
    maxFiles?: number;
    maxFileSize?: number;
    skipExtensions?: string[];
    rulesDir?: string;
  }) {
    this.rules = options?.rules ?? [...DEFAULT_PATTERN_RULES];
    this.maxFiles = options?.maxFiles ?? MAX_FILES;
    this.maxFileSize = options?.maxFileSize ?? MAX_FILE_SIZE;
    this.skipExtensions = new Set([
      ...SKIP_EXTENSIONS,
      ...(options?.skipExtensions ?? []),
    ]);

    if (options?.rulesDir) {
      this.loadCustomRules(options.rulesDir);
    }
  }

  private loadCustomRules(rulesDir: string): void {
    if (!existsSync(rulesDir)) return;

    try {
      const entries = readdirSync(rulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".json")) continue;

        const filePath = join(rulesDir, entry.name);
        try {
          const content = readFileSync(filePath, "utf-8");
          const ruleDefs = JSON.parse(content) as PatternRuleDef[];

          for (const def of ruleDefs) {
            if (!def.id || !def.pattern || !def.message) {
              logger.warn(`Skipping invalid rule in ${entry.name}: missing required fields`);
              continue;
            }

            try {
              const pattern = new RegExp(def.pattern, def.flags ?? "i");
              this.rules.push({
                id: def.id,
                severity: def.severity ?? "medium",
                pattern,
                message: def.message,
              });
            } catch {
              logger.warn(`Skipping invalid regex in ${entry.name}: ${def.id}`);
            }
          }
        } catch {
          logger.debug(`Failed to load rules from ${filePath}`);
        }
      }
    } catch {
      logger.debug(`Failed to read rules directory: ${rulesDir}`);
    }
  }

  scanSkill(skillDir: string, skillName?: string): ScanResult {
    const startTime = Date.now();
    const name = skillName ?? skillDir.split(/[\\/]/).pop() ?? "unknown";
    const dirPath = resolve(skillDir);

    if (!existsSync(dirPath)) {
      return {
        skillName: name,
        isSafe: true,
        maxSeverity: "info",
        findings: [],
        scanDurationSeconds: 0,
        analyzersUsed: [],
      };
    }

    const files = this.discoverFiles(dirPath);
    const findings: ScanFinding[] = [];

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const relPath = relative(dirPath, filePath);

        for (const rule of this.rules) {
          const match = content.match(rule.pattern);
          if (match) {
            const lineNum = this.findLineNumber(content, match.index ?? 0);
            findings.push({
              id: `${rule.id}:${relPath}:${lineNum}`,
              severity: rule.severity,
              rule: rule.id,
              message: rule.message,
              file: relPath,
              line: lineNum,
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    const maxSeverity = this.computeMaxSeverity(findings);
    const elapsed = (Date.now() - startTime) / 1000;

    const result: ScanResult = {
      skillName: name,
      isSafe: maxSeverity === "info" || maxSeverity === "low",
      maxSeverity,
      findings,
      scanDurationSeconds: Math.round(elapsed * 1000) / 1000,
      analyzersUsed: ["pattern"],
    };

    logger.info(`Skill scan '${name}': ${findings.length} finding(s), safe=${result.isSafe}, severity=${maxSeverity}`);

    return result;
  }

  private discoverFiles(dir: string): string[] {
    const result: string[] = [];

    const walk = (currentDir: string) => {
      if (result.length >= this.maxFiles) return;

      let entries;
      try {
        entries = readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (result.length >= this.maxFiles) break;

        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__pycache__") {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (this.skipExtensions.has(ext)) continue;

          try {
            const stat = statSync(fullPath);
            if (stat.size > this.maxFileSize) continue;
          } catch {
            continue;
          }

          result.push(fullPath);
        }
      }
    };

    walk(dir);
    return result;
  }

  private findLineNumber(content: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i++) {
      if (content[i] === "\n") line++;
    }
    return line;
  }

  private computeMaxSeverity(findings: ScanFinding[]): ScanSeverity {
    const severityOrder: ScanSeverity[] = ["info", "low", "medium", "high", "critical"];
    let maxIndex = 0;

    for (const finding of findings) {
      const idx = severityOrder.indexOf(finding.severity);
      if (idx > maxIndex) maxIndex = idx;
    }

    return severityOrder[maxIndex] ?? "info";
  }
}

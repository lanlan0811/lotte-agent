import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../tool-registry.js";
import { formatErrorMessage } from "../../errors/errors.js";
import { logger } from "../../utils/logger.js";

export const codeSearchSchema = z.object({
  pattern: z.string().describe("Search pattern (regex supported)"),
  path: z.string().describe("Directory or file path to search in"),
  filePattern: z.string().optional().describe("File glob pattern to filter (e.g., '*.ts', '*.{js,ts}')"),
  maxResults: z.number().int().min(1).max(100).optional().default(30).describe("Maximum number of results"),
  caseInsensitive: z.boolean().optional().default(false).describe("Case insensitive search"),
});

export const codeAnalyzeSchema = z.object({
  path: z.string().describe("File or directory path to analyze"),
  analysisType: z.enum(["structure", "dependencies", "complexity", "stats"]).describe("Type of analysis to perform"),
});

export type CodeSearchArgs = z.infer<typeof codeSearchSchema>;
export type CodeAnalyzeArgs = z.infer<typeof codeAnalyzeSchema>;

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
}

function searchInFile(
  filePath: string,
  pattern: RegExp,
  maxResults: number,
): SearchResult[] {
  const results: SearchResult[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = pattern.exec(line);
      if (match) {
        results.push({
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          text: line.trim(),
          match: match[0],
        });
      }
    }
  } catch {
    logger.debug("Skip unreadable file during search");
  }

  return results;
}

function shouldSearchFile(fileName: string, filePattern?: string): boolean {
  if (!filePattern) return true;

  const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".cache"]);
  const parentDir = fileName.split(/[/\\]/).slice(-2, -1)[0];
  if (parentDir && skipDirs.has(parentDir)) return false;

  const patterns = filePattern.replace(/^\*\./, "").split(",").map((p) => p.trim().replace(/^\*\./, ""));
  const ext = path.extname(fileName).replace(".", "");

  return patterns.some((p) => {
    if (p === ext) return true;
    if (p.startsWith("*.")) return ext === p.slice(2);
    return fileName.endsWith(p);
  });
}

function walkDirectory(dirPath: string, filePattern?: string): string[] {
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".cache", "coverage"]);

  function walk(currentDir: string): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (shouldSearchFile(entry.name, filePattern)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      logger.debug("Skip inaccessible directory during walk");
    }
  }

  walk(dirPath);
  return files;
}

export const codeSearchTool: ToolDefinition = {
  name: "code_search",
  description:
    "Search for patterns in code files. Supports regex, file filtering, and case sensitivity options.",
  category: "fs",
  parameters: codeSearchSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = codeSearchSchema.parse(args);
    const searchPath = path.resolve(parsed.path);
    const maxResults = parsed.maxResults ?? 30;

    if (!fs.existsSync(searchPath)) {
      return `Error: Path not found: ${searchPath}`;
    }

    try {
      const flags = parsed.caseInsensitive ? "gi" : "g";
      const pattern = new RegExp(parsed.pattern, flags);

      let files: string[];
      if (fs.statSync(searchPath).isFile()) {
        files = [searchPath];
      } else {
        files = walkDirectory(searchPath, parsed.filePattern);
      }

      const allResults: SearchResult[] = [];

      for (const file of files) {
        if (allResults.length >= maxResults) break;
        const results = searchInFile(file, pattern, maxResults - allResults.length);
        allResults.push(...results);
      }

      if (allResults.length === 0) {
        return `No matches found for pattern: ${parsed.pattern}`;
      }

      const lines = allResults.map((r) => {
        const relativePath = path.relative(searchPath, r.file);
        const displayPath = relativePath || r.file;
        const highlighted = r.text.replace(new RegExp(escapeRegex(r.match), "g"), `**${r.match}**`);
        return `${displayPath}:${r.line}:${r.column}: ${highlighted}`;
      });

      return `Found ${allResults.length} match(es) for "${parsed.pattern}":\n\n${lines.join("\n")}`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error searching code: ${msg}`;
    }
  },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface FileStats {
  path: string;
  lines: number;
  characters: number;
  functions: number;
  classes: number;
  imports: number;
}

function analyzeFile(filePath: string): FileStats {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const ext = path.extname(filePath);

  let functions = 0;
  let classes = 0;
  let imports = 0;

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
    const funcPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g;
    const classPattern = /class\s+\w+/g;
    const importPattern = /(?:import\s|require\s*\()/g;

    const matches = content.match(funcPattern);
    functions = matches ? matches.length : 0;

    const classMatches = content.match(classPattern);
    classes = classMatches ? classMatches.length : 0;

    const importMatches = content.match(importPattern);
    imports = importMatches ? importMatches.length : 0;
  } else if (ext === ".py") {
    const funcPattern = /def\s+\w+/g;
    const classPattern = /class\s+\w+/g;
    const importPattern = /(?:import\s|from\s+\w+\s+import)/g;

    const matches = content.match(funcPattern);
    functions = matches ? matches.length : 0;

    const classMatches = content.match(classPattern);
    classes = classMatches ? classMatches.length : 0;

    const importMatches = content.match(importPattern);
    imports = importMatches ? importMatches.length : 0;
  }

  return {
    path: filePath,
    lines: lines.length,
    characters: content.length,
    functions,
    classes,
    imports,
  };
}

export const codeAnalyzeTool: ToolDefinition = {
  name: "code_analyze",
  description:
    "Analyze code files or directories. Supports structure analysis, dependency analysis, complexity metrics, and statistics.",
  category: "fs",
  parameters: codeAnalyzeSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = codeAnalyzeSchema.parse(args);
    const analyzePath = path.resolve(parsed.path);

    if (!fs.existsSync(analyzePath)) {
      return `Error: Path not found: ${analyzePath}`;
    }

    try {
      const isDir = fs.statSync(analyzePath).isDirectory();
      const codeExtensions = new Set([
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h",
      ]);

      if (parsed.analysisType === "stats") {
        const files = isDir
          ? walkDirectory(analyzePath).filter((f) => codeExtensions.has(path.extname(f)))
          : [analyzePath];

        const stats: FileStats[] = [];
        for (const file of files.slice(0, 100)) {
          try {
            stats.push(analyzeFile(file));
          } catch {
            logger.debug(`Skip unreadable file during stats: ${file}`);
          }
        }

        const totalLines = stats.reduce((sum, s) => sum + s.lines, 0);
        const totalChars = stats.reduce((sum, s) => sum + s.characters, 0);
        const totalFunctions = stats.reduce((sum, s) => sum + s.functions, 0);
        const totalClasses = stats.reduce((sum, s) => sum + s.classes, 0);
        const totalImports = stats.reduce((sum, s) => sum + s.imports, 0);

        const extCounts: Record<string, number> = {};
        for (const file of files) {
          const ext = path.extname(file) || "other";
          extCounts[ext] = (extCounts[ext] ?? 0) + 1;
        }

        const lines = [
          `Code Statistics for: ${analyzePath}`,
          `Files analyzed: ${stats.length}`,
          `Total lines: ${totalLines.toLocaleString()}`,
          `Total characters: ${totalChars.toLocaleString()}`,
          `Functions: ${totalFunctions}`,
          `Classes: ${totalClasses}`,
          `Imports: ${totalImports}`,
          ``,
          `File types:`,
        ];

        for (const [ext, count] of Object.entries(extCounts).sort((a, b) => b[1] - a[1])) {
          lines.push(`  ${ext}: ${count} file(s)`);
        }

        return lines.join("\n");
      }

      if (parsed.analysisType === "structure") {
        if (isDir) {
          const entries = fs.readdirSync(analyzePath, { withFileTypes: true });
          const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
          const files = entries.filter((e) => e.isFile()).map((e) => e.name);

          const lines = [
            `Directory structure: ${analyzePath}`,
            ``,
            `Directories (${dirs.length}):`,
            ...dirs.slice(0, 30).map((d) => `  📁 ${d}`),
            ``,
            `Files (${files.length}):`,
            ...files.slice(0, 30).map((f) => `  📄 ${f}`),
          ];

          if (files.length > 30) {
            lines.push(`  ... and ${files.length - 30} more`);
          }

          return lines.join("\n");
        }

        const content = fs.readFileSync(analyzePath, "utf-8");
        void content;
        const ext = path.extname(analyzePath);
        const stats = analyzeFile(analyzePath);

        return [
          `File: ${analyzePath}`,
          `Lines: ${stats.lines}`,
          `Characters: ${stats.characters}`,
          `Functions: ${stats.functions}`,
          `Classes: ${stats.classes}`,
          `Imports: ${stats.imports}`,
          `Extension: ${ext}`,
        ].join("\n");
      }

      if (parsed.analysisType === "dependencies") {
        const files = isDir
          ? walkDirectory(analyzePath).filter((f) => [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(path.extname(f)))
          : [analyzePath];

        const deps: Record<string, string[]> = {};

        for (const file of files.slice(0, 50)) {
          try {
            const content = fs.readFileSync(file, "utf-8");
            const importPattern = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

            const fileDeps: string[] = [];
            let match: RegExpExecArray | null;
            while ((match = importPattern.exec(content)) !== null) {
              const dep = match[1] ?? match[2];
              if (dep) fileDeps.push(dep);
            }

            const relativePath = path.relative(analyzePath, file);
            deps[relativePath] = [...new Set(fileDeps)];
          } catch {
            logger.debug(`Skip file during dependency analysis: ${file}`);
          }
        }

        const lines = [`Dependencies for: ${analyzePath}`, ""];

        for (const [file, fileDeps] of Object.entries(deps)) {
          if (fileDeps.length > 0) {
            lines.push(`${file}:`);
            for (const dep of fileDeps) {
              lines.push(`  - ${dep}`);
            }
          }
        }

        return lines.join("\n");
      }

      if (parsed.analysisType === "complexity") {
        const files = isDir
          ? walkDirectory(analyzePath).filter((f) => [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(f)))
          : [analyzePath];

        const results: Array<{ file: string; lines: number; functions: number; ratio: string }> = [];

        for (const file of files.slice(0, 50)) {
          try {
            const stats = analyzeFile(file);
            const ratio = stats.functions > 0 ? (stats.lines / stats.functions).toFixed(1) : "N/A";
            results.push({
              file: path.relative(analyzePath, file),
              lines: stats.lines,
              functions: stats.functions,
              ratio,
            });
          } catch {
            logger.debug(`Skip file during complexity analysis: ${file}`);
          }
        }

        results.sort((a, b) => b.lines - a.lines);

        const lines = [
          `Complexity analysis for: ${analyzePath}`,
          ``,
          "Lines/Function ratio (higher = potentially more complex):",
          "",
          ...results.map((r) => `${r.file}: ${r.lines} lines, ${r.functions} functions (${r.ratio} lines/func)`),
        ];

        return lines.join("\n");
      }

      return `Unknown analysis type: ${parsed.analysisType}`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error analyzing code: ${msg}`;
    }
  },
};

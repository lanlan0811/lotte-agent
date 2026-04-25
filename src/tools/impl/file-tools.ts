import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../tool-registry.js";
import { logger } from "../../utils/logger.js";
import { formatErrorMessage } from "../../errors/errors.js";

const MAX_READ_SIZE = 1024 * 1024;
const DEFAULT_READ_LINES = 2000;

export const readSchema = z.object({
  path: z.string().describe("Absolute file path to read"),
  offset: z.number().int().min(1).optional().describe("Starting line number (1-based)"),
  limit: z.number().int().min(1).optional().describe("Number of lines to read"),
  encoding: z.enum(["utf-8", "ascii", "base64", "hex"]).optional().default("utf-8").describe("File encoding"),
});

export const writeSchema = z.object({
  path: z.string().describe("Absolute file path to write"),
  content: z.string().describe("Content to write to the file"),
  createDirs: z.boolean().optional().default(false).describe("Create parent directories if they don't exist"),
  encoding: z.enum(["utf-8", "ascii", "base64", "hex"]).optional().default("utf-8").describe("File encoding"),
  append: z.boolean().optional().default(false).describe("Append to file instead of overwriting"),
});

export const editSchema = z.object({
  path: z.string().describe("Absolute file path to edit"),
  oldText: z.string().describe("Text to search for (must be unique in the file)"),
  newText: z.string().describe("Text to replace with"),
  replaceAll: z.boolean().optional().default(false).describe("Replace all occurrences instead of just the first"),
});

export const listDirSchema = z.object({
  path: z.string().describe("Directory path to list"),
  recursive: z.boolean().optional().default(false).describe("List recursively"),
  pattern: z.string().optional().describe("Glob pattern to filter files"),
});

export type ReadArgs = z.infer<typeof readSchema>;
export type WriteArgs = z.infer<typeof writeSchema>;
export type EditArgs = z.infer<typeof editSchema>;
export type ListDirArgs = z.infer<typeof listDirSchema>;

function ensureAbsolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function readFileContent(filePath: string, encoding: string): string {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_READ_SIZE) {
    logger.warn(`File ${filePath} is large (${stats.size} bytes), truncating`);
  }

  if (encoding === "base64" || encoding === "hex") {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString(encoding as BufferEncoding);
  }

  return fs.readFileSync(filePath, { encoding: encoding as BufferEncoding, flag: "r" });
}

export const readTool: ToolDefinition = {
  name: "read",
  description:
    "Read file contents. Supports line range selection and different encodings. For large files, use offset/limit to read specific sections.",
  category: "fs",
  parameters: readSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = readSchema.parse(args);
    const filePath = ensureAbsolutePath(parsed.path);

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return `Error: Path is a directory, not a file: ${filePath}`;
    }

    try {
      const content = readFileContent(filePath, parsed.encoding ?? "utf-8");

      if (parsed.encoding === "base64" || parsed.encoding === "hex") {
        return content;
      }

      const lines = content.split("\n");
      const offset = parsed.offset ?? 1;
      const limit = parsed.limit ?? DEFAULT_READ_LINES;

      const startLine = Math.max(1, offset) - 1;
      const endLine = Math.min(lines.length, startLine + limit);

      const selectedLines = lines.slice(startLine, endLine);
      const numberedLines = selectedLines.map((line, i) => {
        const lineNum = startLine + i + 1;
        return `${String(lineNum).padStart(6)} | ${line}`;
      });

      const header = `File: ${filePath} (${lines.length} lines)`;
      const range = `Showing lines ${startLine + 1}-${endLine} of ${lines.length}`;

      return `${header}\n${range}\n${numberedLines.join("\n")}`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error reading file: ${msg}`;
    }
  },
};

export const writeTool: ToolDefinition = {
  name: "write",
  description:
    "Create or overwrite a file with the given content. Can create parent directories if needed.",
  category: "fs",
  parameters: writeSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = writeSchema.parse(args);
    const filePath = ensureAbsolutePath(parsed.path);

    try {
      if (parsed.createDirs) {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
      }

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        return `Error: Directory does not exist: ${dir}. Use createDirs=true to create it.`;
      }

      if (parsed.encoding === "base64" || parsed.encoding === "hex") {
        const buffer = Buffer.from(parsed.content, parsed.encoding as BufferEncoding);
        fs.writeFileSync(filePath, buffer);
      } else {
        const flag = parsed.append ? "a" : "w";
        fs.writeFileSync(filePath, parsed.content, { encoding: parsed.encoding as BufferEncoding, flag });
      }

      const action = parsed.append ? "Appended to" : "Wrote";
      const size = fs.statSync(filePath).size;
      return `${action} file: ${filePath} (${size} bytes)`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error writing file: ${msg}`;
    }
  },
};

export const editTool: ToolDefinition = {
  name: "edit",
  description:
    "Make precise edits to a file by replacing specific text. The oldText must be unique in the file unless replaceAll is true.",
  category: "fs",
  parameters: editSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = editSchema.parse(args);
    const filePath = ensureAbsolutePath(parsed.path);

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      if (!content.includes(parsed.oldText)) {
        return `Error: Text not found in file. Make sure the oldText matches exactly, including whitespace and indentation.`;
      }

      if (!parsed.replaceAll) {
        const firstIndex = content.indexOf(parsed.oldText);
        const secondIndex = content.indexOf(parsed.oldText, firstIndex + 1);
        if (secondIndex !== -1) {
          return `Error: Found multiple occurrences of the search text. Use replaceAll=true to replace all, or provide more context to make the match unique.`;
        }
      }

      const newContent = parsed.replaceAll
        ? content.replaceAll(parsed.oldText, parsed.newText)
        : content.replace(parsed.oldText, parsed.newText);

      fs.writeFileSync(filePath, newContent, "utf-8");

      const occurrences = parsed.replaceAll
        ? content.split(parsed.oldText).length - 1
        : 1;
      return `Edited ${filePath}: replaced ${occurrences} occurrence(s)`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error editing file: ${msg}`;
    }
  },
};

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description:
    "List directory contents. Supports recursive listing and glob pattern filtering.",
  category: "fs",
  parameters: listDirSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = listDirSchema.parse(args);
    const dirPath = ensureAbsolutePath(parsed.path);

    if (!fs.existsSync(dirPath)) {
      return `Error: Directory not found: ${dirPath}`;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return `Error: Path is not a directory: ${dirPath}`;
    }

    try {
      const entries = listDirectory(dirPath, parsed.recursive ?? false, parsed.pattern);
      if (entries.length === 0) {
        return `Empty directory: ${dirPath}`;
      }

      const maxEntries = 500;
      const truncated = entries.length > maxEntries;
      const displayEntries = truncated ? entries.slice(0, maxEntries) : entries;

      const lines = displayEntries.map((entry) => {
        const prefix = entry.isDirectory ? "d" : "-";
        const size = entry.isDirectory ? "" : ` (${entry.size} bytes)`;
        const relativePath = path.relative(dirPath, entry.path);
        return `${prefix} ${relativePath}${size}`;
      });

      let result = `Directory: ${dirPath} (${entries.length} entries)\n${lines.join("\n")}`;

      if (truncated) {
        result += `\n... and ${entries.length - maxEntries} more entries`;
      }

      return result;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error listing directory: ${msg}`;
    }
  },
};

interface DirEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

function listDirectory(dirPath: string, recursive: boolean, pattern?: string): DirEntry[] {
  const entries: DirEntry[] = [];
  const globPattern = pattern;

  function walk(currentDir: string): void {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        if (matchesGlob(item.name, globPattern)) {
          entries.push({
            path: fullPath,
            name: item.name,
            isDirectory: true,
            size: 0,
          });
        }
        if (recursive) {
          walk(fullPath);
        }
      } else if (item.isFile()) {
        if (matchesGlob(item.name, globPattern)) {
          const stat = fs.statSync(fullPath);
          entries.push({
            path: fullPath,
            name: item.name,
            isDirectory: false,
            size: stat.size,
          });
        }
      }
    }
  }

  walk(dirPath);
  return entries;
}

function matchesGlob(name: string, pattern?: string): boolean {
  if (!pattern) return true;

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  try {
    const regex = new RegExp(`^${regexStr}$`, "i");
    return regex.test(name);
  } catch {
    logger.debug(`Invalid regex pattern, falling back to exact match: ${pattern}`);
    return name === pattern;
  }
}

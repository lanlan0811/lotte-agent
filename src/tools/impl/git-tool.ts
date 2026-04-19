import { z } from "zod";
import { execFile } from "node:child_process";
import path from "node:path";
import type { ToolDefinition } from "../tool-registry.js";
import { logger } from "../../utils/logger.js";
import { isWindows } from "../../utils/platform.js";

const DEFAULT_TIMEOUT = 30000;
const MAX_OUTPUT_LENGTH = 50000;

export const gitSchema = z.object({
  command: z.string().describe("Git command to execute (e.g., 'status', 'log', 'diff')"),
  args: z.array(z.string()).optional().describe("Additional arguments for the git command"),
  workdir: z.string().optional().describe("Working directory (repository root)"),
  timeout: z.number().positive().optional().describe("Timeout in milliseconds"),
});

export type GitArgs = z.infer<typeof gitSchema>;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  const half = Math.floor(MAX_OUTPUT_LENGTH / 2);
  return output.slice(0, half) + "\n... [truncated] ...\n" + output.slice(-half);
}

function executeGit(
  args: string[],
  workdir?: string,
  timeout?: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const gitPath = isWindows() ? "git.exe" : "git";
    const timer = setTimeout(() => {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: `Git command timed out after ${timeout ?? DEFAULT_TIMEOUT}ms`,
      });
    }, timeout ?? DEFAULT_TIMEOUT);

    const child = execFile(
      gitPath,
      args,
      {
        cwd: workdir ?? process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeout ?? DEFAULT_TIMEOUT,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        resolve({
          exitCode: error ? (error.code ?? 1) as number : 0,
          stdout: truncateOutput(stdout ?? ""),
          stderr: truncateOutput(stderr ?? ""),
        });
      },
    );

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}

export const gitTool: ToolDefinition = {
  name: "git",
  description:
    "Execute Git commands. Supports all standard git operations like status, log, diff, add, commit, push, pull, branch, etc.",
  category: "runtime",
  parameters: gitSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = gitSchema.parse(args);
    const workdir = parsed.workdir ? path.resolve(parsed.workdir) : undefined;

    const gitArgs = [parsed.command, ...(parsed.args ?? [])];

    logger.info(`Git: ${gitArgs.join(" ")}${workdir ? ` in ${workdir}` : ""}`);

    const result = await executeGit(gitArgs, workdir, parsed.timeout);

    const parts: string[] = [];

    if (result.exitCode !== 0) {
      parts.push(`[Exit code: ${result.exitCode}]`);
    }

    if (result.stdout) {
      parts.push(result.stdout);
    }

    if (result.stderr) {
      parts.push(`[stderr]\n${result.stderr}`);
    }

    if (!result.stdout && !result.stderr && result.exitCode === 0) {
      parts.push("(no output)");
    }

    return parts.join("\n");
  },
};

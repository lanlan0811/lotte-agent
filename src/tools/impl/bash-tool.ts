import { z } from "zod";
import { spawn } from "node:child_process";
import path from "node:path";
import type { ToolDefinition } from "../tool-registry.js";
import { logger } from "../../utils/logger.js";
import { isWindows } from "../../utils/platform.js";

const MAX_OUTPUT_LENGTH = 50000;
const DEFAULT_TIMEOUT = 30000;

export const execSchema = z.object({
  command: z.string().describe("Shell command to execute"),
  workdir: z.string().optional().describe("Working directory for command execution"),
  timeout: z.number().positive().optional().describe("Timeout in milliseconds (default 30000)"),
  env: z.record(z.string(), z.string()).optional().describe("Additional environment variables"),
  background: z.boolean().optional().default(false).describe("Run command in background"),
});

export type ExecArgs = z.infer<typeof execSchema>;

interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

function truncateOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
  if (output.length <= maxLength) return output;
  const half = Math.floor(maxLength / 2);
  return output.slice(0, half) + "\n... [truncated] ...\n" + output.slice(-half);
}

function getShellCommand(): { shell: string; prefix: string[] } {
  if (isWindows()) {
    return { shell: "cmd.exe", prefix: ["/c"] };
  }
  return { shell: "/bin/sh", prefix: ["-c"] };
}

function executeCommand(
  command: string,
  workdir?: string,
  timeoutMs?: number,
  env?: Record<string, string>,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const { shell, prefix } = getShellCommand();
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT;

    const spawnEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...env,
    };

    if (isWindows()) {
      spawnEnv.ComSpec = shell;
    }

    const child = spawn(shell, [...prefix, command], {
      cwd: workdir ?? process.cwd(),
      env: spawnEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: "",
        stderr: err.message,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

export const execTool: ToolDefinition = {
  name: "exec",
  description:
    "Execute shell commands. Use for running CLI tools, scripts, and system commands. Supports timeout and working directory configuration.",
  category: "runtime",
  parameters: execSchema,
  requiresApproval: true,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = execSchema.parse(args);
    const workdir = parsed.workdir
      ? path.resolve(parsed.workdir)
      : undefined;

    logger.info(`Executing command: ${parsed.command}${workdir ? ` in ${workdir}` : ""}`);

    const result = await executeCommand(
      parsed.command,
      workdir,
      parsed.timeout,
      parsed.env,
    );

    const parts: string[] = [];

    if (result.timedOut) {
      parts.push(`[Command timed out after ${parsed.timeout ?? DEFAULT_TIMEOUT}ms]`);
    }

    if (result.exitCode !== null && result.exitCode !== 0) {
      parts.push(`[Exit code: ${result.exitCode}]`);
    }

    parts.push(`[Duration: ${result.durationMs}ms]`);

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

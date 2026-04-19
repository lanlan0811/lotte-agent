import { z } from "zod";
import type { ToolDefinition } from "./tool-registry.js";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createTool(definition: ToolDefinition): ToolDefinition {
  return definition;
}

export function successResult(output: string, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, metadata };
}

export function errorResult(error: string, metadata?: Record<string, unknown>): ToolResult {
  return { success: false, output: "", error, metadata };
}

export function textResult(text: string): string {
  return text;
}

export function errorText(message: string): string {
  return `Error: ${message}`;
}

export const commonSchemas = {
  filePath: z.string().describe("Absolute file path"),
  workingDir: z.string().optional().describe("Working directory for command execution"),
  encoding: z.enum(["utf-8", "ascii", "base64", "hex"]).optional().default("utf-8").describe("File encoding"),
  timeout: z.number().positive().optional().describe("Timeout in milliseconds"),
};

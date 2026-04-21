import type { ToolRegistry } from "../tool-registry.js";
import { execTool } from "./bash-tool.js";
import { readTool, writeTool, editTool, listDirTool } from "./file-tools.js";
import {
  browserNavigateTool,
  browserScreenshotTool,
  browserClickTool,
  browserFillTool,
  browserExtractTool,
  browserExecuteTool,
  browserHoverTool,
  browserSelectTool,
  browserScrollTool,
  browserWaitTool,
  browserTypeTool,
  browserUploadTool,
  browserGoBackTool,
  browserGoForwardTool,
  browserPressKeyTool,
  browserGetContentTool,
} from "./browser-tools.js";
import { httpFetchTool, webSearchTool } from "./network-tools.js";
import { gitTool } from "./git-tool.js";
import { codeSearchTool, codeAnalyzeTool } from "./code-tools.js";
import { auditQueryTool, auditStatsTool } from "./audit-tool.js";
import {
  memorySearchTool,
  memoryStoreTool,
  memoryGetTool,
  memoryDeleteTool,
  setMemoryManager,
} from "./memory-tools.js";
import { logger } from "../../utils/logger.js";

export { auditLog } from "./audit-tool.js";
export type { AuditEntry, AuditLogConfig } from "./audit-tool.js";
export { setMemoryManager };

export function registerAllTools(registry: ToolRegistry): void {
  registry.register(execTool);

  registry.register(readTool);
  registry.register(writeTool);
  registry.register(editTool);
  registry.register(listDirTool);

  registry.register(browserNavigateTool);
  registry.register(browserScreenshotTool);
  registry.register(browserClickTool);
  registry.register(browserFillTool);
  registry.register(browserExtractTool);
  registry.register(browserExecuteTool);
  registry.register(browserHoverTool);
  registry.register(browserSelectTool);
  registry.register(browserScrollTool);
  registry.register(browserWaitTool);
  registry.register(browserTypeTool);
  registry.register(browserUploadTool);
  registry.register(browserGoBackTool);
  registry.register(browserGoForwardTool);
  registry.register(browserPressKeyTool);
  registry.register(browserGetContentTool);

  registry.register(httpFetchTool);
  registry.register(webSearchTool);

  registry.register(gitTool);

  registry.register(codeSearchTool);
  registry.register(codeAnalyzeTool);

  registry.register(auditQueryTool);
  registry.register(auditStatsTool);

  registry.register(memorySearchTool);
  registry.register(memoryStoreTool);
  registry.register(memoryGetTool);
  registry.register(memoryDeleteTool);

  logger.info(`Registered ${registry.size()} tools across ${registry.listCategories().length} categories`);
}

export const toolList = [
  execTool,
  readTool,
  writeTool,
  editTool,
  listDirTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserClickTool,
  browserFillTool,
  browserExtractTool,
  browserExecuteTool,
  browserHoverTool,
  browserSelectTool,
  browserScrollTool,
  browserWaitTool,
  browserTypeTool,
  browserUploadTool,
  browserGoBackTool,
  browserGoForwardTool,
  browserPressKeyTool,
  browserGetContentTool,
  httpFetchTool,
  webSearchTool,
  gitTool,
  codeSearchTool,
  codeAnalyzeTool,
  auditQueryTool,
  auditStatsTool,
  memorySearchTool,
  memoryStoreTool,
  memoryGetTool,
  memoryDeleteTool,
] as const;

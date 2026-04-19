import { z } from "zod";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { ToolDefinition } from "../tool-registry.js";

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export const browserNavigateSchema = z.object({
  url: z.string().describe("URL to navigate to"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional().default("domcontentloaded").describe("When to consider navigation complete"),
  timeout: z.number().positive().optional().describe("Navigation timeout in milliseconds"),
});

export const browserScreenshotSchema = z.object({
  selector: z.string().optional().describe("CSS selector for element to screenshot"),
  fullPage: z.boolean().optional().default(false).describe("Capture full scrollable page"),
  path: z.string().optional().describe("File path to save screenshot"),
});

export const browserClickSchema = z.object({
  selector: z.string().describe("CSS selector for element to click"),
});

export const browserFillSchema = z.object({
  selector: z.string().describe("CSS selector for input field"),
  value: z.string().describe("Value to fill"),
});

export const browserExtractSchema = z.object({
  selector: z.string().describe("CSS selector for elements to extract"),
  attribute: z.string().optional().describe("Attribute to extract (default: textContent)"),
});

export const browserExecuteSchema = z.object({
  script: z.string().describe("JavaScript code to execute in the page"),
});

export type BrowserNavigateArgs = z.infer<typeof browserNavigateSchema>;
export type BrowserScreenshotArgs = z.infer<typeof browserScreenshotSchema>;
export type BrowserClickArgs = z.infer<typeof browserClickSchema>;
export type BrowserFillArgs = z.infer<typeof browserFillSchema>;
export type BrowserExtractArgs = z.infer<typeof browserExtractSchema>;
export type BrowserExecuteArgs = z.infer<typeof browserExecuteSchema>;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async getPage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      this.page = await this.context.newPage();
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.context!.newPage();
    }

    return this.page;
  }

  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

const browserManager = new BrowserManager();

export const browserNavigateTool: ToolDefinition = {
  name: "browser_navigate",
  description: "Navigate to a URL in the browser. Creates a new browser instance if needed.",
  category: "ui",
  parameters: browserNavigateSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserNavigateSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      const response = await page.goto(parsed.url, {
        waitUntil: parsed.waitUntil ?? "domcontentloaded",
        timeout: parsed.timeout ?? DEFAULT_TIMEOUT,
      });

      const title = await page.title();
      const status = response?.status() ?? "unknown";

      return `Navigated to: ${parsed.url}\nTitle: ${title}\nStatus: ${status}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error navigating to ${parsed.url}: ${msg}`;
    }
  },
};

export const browserScreenshotTool: ToolDefinition = {
  name: "browser_screenshot",
  description: "Take a screenshot of the current page or a specific element.",
  category: "ui",
  parameters: browserScreenshotSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserScreenshotSchema.parse(args);

    try {
      const page = await browserManager.getPage();

      const screenshotOptions: Record<string, unknown> = {
        type: "png",
        fullPage: parsed.fullPage ?? false,
      };

      if (parsed.path) {
        screenshotOptions.path = parsed.path;
      }

      let buffer: Buffer;

      if (parsed.selector) {
        const element = await page.$(parsed.selector);
        if (!element) {
          return `Error: Element not found: ${parsed.selector}`;
        }
        buffer = await element.screenshot(screenshotOptions) as Buffer;
      } else {
        buffer = await page.screenshot(screenshotOptions) as Buffer;
      }

      const base64 = buffer.toString("base64");
      const sizeKB = Math.round(buffer.length / 1024);

      if (parsed.path) {
        return `Screenshot saved to: ${parsed.path} (${sizeKB} KB)`;
      }

      return `Screenshot captured (${sizeKB} KB)\ndata:image/png;base64,${base64.slice(0, 100)}...`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error taking screenshot: ${msg}`;
    }
  },
};

export const browserClickTool: ToolDefinition = {
  name: "browser_click",
  description: "Click an element on the page.",
  category: "ui",
  parameters: browserClickSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserClickSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.click(parsed.selector, { timeout: DEFAULT_TIMEOUT });
      return `Clicked: ${parsed.selector}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error clicking ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserFillTool: ToolDefinition = {
  name: "browser_fill",
  description: "Fill an input field on the page.",
  category: "ui",
  parameters: browserFillSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserFillSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.fill(parsed.selector, parsed.value, { timeout: DEFAULT_TIMEOUT });
      return `Filled ${parsed.selector} with: ${parsed.value}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error filling ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserExtractTool: ToolDefinition = {
  name: "browser_extract",
  description: "Extract text or attributes from elements on the page.",
  category: "ui",
  parameters: browserExtractSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserExtractSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      const elements = await page.$$(parsed.selector);

      if (elements.length === 0) {
        return `No elements found matching: ${parsed.selector}`;
      }

      const results: string[] = [];

      for (const element of elements.slice(0, 50)) {
        if (parsed.attribute) {
          const value = await element.getAttribute(parsed.attribute);
          results.push(value ?? "");
        } else {
          const text = await element.textContent();
          results.push(text?.trim() ?? "");
        }
      }

      return `Found ${elements.length} element(s), showing ${Math.min(elements.length, 50)}:\n${results.filter(Boolean).join("\n")}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error extracting from ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserExecuteTool: ToolDefinition = {
  name: "browser_execute",
  description: "Execute JavaScript code in the browser page context.",
  category: "ui",
  parameters: browserExecuteSchema,
  requiresApproval: true,
  dangerous: true,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserExecuteSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      const result = await page.evaluate(parsed.script);

      if (result === undefined || result === null) {
        return "Script executed (no return value)";
      }

      const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return `Result: ${output}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error executing script: ${msg}`;
    }
  },
};

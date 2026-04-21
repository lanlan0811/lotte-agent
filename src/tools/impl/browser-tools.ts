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

export const browserHoverSchema = z.object({
  selector: z.string().describe("CSS selector for element to hover over"),
});

export const browserSelectSchema = z.object({
  selector: z.string().describe("CSS selector for select element"),
  value: z.string().describe("Value to select"),
});

export const browserScrollSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
  amount: z.number().positive().optional().default(300).describe("Pixels to scroll"),
  selector: z.string().optional().describe("CSS selector for scrollable container (default: page)"),
});

export const browserWaitSchema = z.object({
  selector: z.string().optional().describe("CSS selector to wait for"),
  timeout: z.number().positive().optional().default(30000).describe("Maximum wait time in milliseconds"),
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional().default("visible").describe("Element state to wait for"),
});

export const browserTypeSchema = z.object({
  selector: z.string().describe("CSS selector for input field"),
  text: z.string().describe("Text to type character by character"),
  delay: z.number().nonnegative().optional().default(50).describe("Delay between keystrokes in milliseconds"),
  clear: z.boolean().optional().default(true).describe("Clear existing content before typing"),
});

export const browserUploadSchema = z.object({
  selector: z.string().describe("CSS selector for file input element"),
  filePath: z.string().describe("Absolute path to the file to upload"),
});

export const browserGoBackSchema = z.object({
  timeout: z.number().positive().optional().default(30000).describe("Navigation timeout in milliseconds"),
});

export const browserGoForwardSchema = z.object({
  timeout: z.number().positive().optional().default(30000).describe("Navigation timeout in milliseconds"),
});

export const browserPressKeySchema = z.object({
  key: z.string().describe("Key to press (e.g., Enter, Tab, Escape, ArrowDown, Control+a)"),
});

export const browserGetContentSchema = z.object({
  selector: z.string().optional().describe("CSS selector for element to get HTML from (default: full page)"),
});

export type BrowserNavigateArgs = z.infer<typeof browserNavigateSchema>;
export type BrowserScreenshotArgs = z.infer<typeof browserScreenshotSchema>;
export type BrowserClickArgs = z.infer<typeof browserClickSchema>;
export type BrowserFillArgs = z.infer<typeof browserFillSchema>;
export type BrowserExtractArgs = z.infer<typeof browserExtractSchema>;
export type BrowserExecuteArgs = z.infer<typeof browserExecuteSchema>;
export type BrowserHoverArgs = z.infer<typeof browserHoverSchema>;
export type BrowserSelectArgs = z.infer<typeof browserSelectSchema>;
export type BrowserScrollArgs = z.infer<typeof browserScrollSchema>;
export type BrowserWaitArgs = z.infer<typeof browserWaitSchema>;
export type BrowserTypeArgs = z.infer<typeof browserTypeSchema>;
export type BrowserUploadArgs = z.infer<typeof browserUploadSchema>;
export type BrowserGoBackArgs = z.infer<typeof browserGoBackSchema>;
export type BrowserGoForwardArgs = z.infer<typeof browserGoForwardSchema>;
export type BrowserPressKeyArgs = z.infer<typeof browserPressKeySchema>;
export type BrowserGetContentArgs = z.infer<typeof browserGetContentSchema>;

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

export const browserHoverTool: ToolDefinition = {
  name: "browser_hover",
  description: "Hover over an element on the page.",
  category: "ui",
  parameters: browserHoverSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserHoverSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.hover(parsed.selector, { timeout: DEFAULT_TIMEOUT });
      return `Hovered: ${parsed.selector}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error hovering ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserSelectTool: ToolDefinition = {
  name: "browser_select",
  description: "Select an option in a dropdown/select element.",
  category: "ui",
  parameters: browserSelectSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserSelectSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.selectOption(parsed.selector, parsed.value, { timeout: DEFAULT_TIMEOUT });
      return `Selected "${parsed.value}" in ${parsed.selector}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error selecting in ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserScrollTool: ToolDefinition = {
  name: "browser_scroll",
  description: "Scroll the page or a specific element in a given direction.",
  category: "ui",
  parameters: browserScrollSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserScrollSchema.parse(args);

    try {
      const page = await browserManager.getPage();

      if (parsed.selector) {
        const element = await page.$(parsed.selector);
        if (!element) {
          return `Error: Element not found: ${parsed.selector}`;
        }
        const scrollMap: Record<string, number[]> = {
          up: [0, -parsed.amount],
          down: [0, parsed.amount],
          left: [-parsed.amount, 0],
          right: [parsed.amount, 0],
        };
        const [dx, dy] = scrollMap[parsed.direction] ?? [0, 0];
        await element.evaluate((el, scrollX, scrollY) => el.scrollBy(scrollX, scrollY), dx, dy);
      } else {
        const scrollMap: Record<string, { x: number; y: number }> = {
          up: { x: 0, y: -parsed.amount },
          down: { x: 0, y: parsed.amount },
          left: { x: -parsed.amount, y: 0 },
          right: { x: parsed.amount, y: 0 },
        };
        const delta = scrollMap[parsed.direction] ?? { x: 0, y: 0 };
        await page.mouse.wheel(delta.x, delta.y);
      }

      return `Scrolled ${parsed.direction} by ${parsed.amount}px`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error scrolling: ${msg}`;
    }
  },
};

export const browserWaitTool: ToolDefinition = {
  name: "browser_wait",
  description: "Wait for an element to appear, disappear, or reach a specific state.",
  category: "ui",
  parameters: browserWaitSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserWaitSchema.parse(args);

    try {
      const page = await browserManager.getPage();

      if (parsed.selector) {
        await page.waitForSelector(parsed.selector, {
          state: parsed.state,
          timeout: parsed.timeout,
        });
        return `Element "${parsed.selector}" reached state: ${parsed.state}`;
      }

      await page.waitForTimeout(parsed.timeout);
      return `Waited ${parsed.timeout}ms`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error waiting: ${msg}`;
    }
  },
};

export const browserTypeTool: ToolDefinition = {
  name: "browser_type",
  description: "Type text into an input field character by character, simulating real keyboard input.",
  category: "ui",
  parameters: browserTypeSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserTypeSchema.parse(args);

    try {
      const page = await browserManager.getPage();

      if (parsed.clear) {
        await page.fill(parsed.selector, "", { timeout: DEFAULT_TIMEOUT });
      }

      await page.type(parsed.selector, parsed.text, {
        delay: parsed.delay,
        timeout: DEFAULT_TIMEOUT,
      });

      return `Typed "${parsed.text}" into ${parsed.selector}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error typing into ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserUploadTool: ToolDefinition = {
  name: "browser_upload",
  description: "Upload a file to a file input element on the page.",
  category: "ui",
  parameters: browserUploadSchema,
  requiresApproval: true,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserUploadSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.setInputFiles(parsed.selector, parsed.filePath, { timeout: DEFAULT_TIMEOUT });
      return `Uploaded file "${parsed.filePath}" to ${parsed.selector}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error uploading to ${parsed.selector}: ${msg}`;
    }
  },
};

export const browserGoBackTool: ToolDefinition = {
  name: "browser_go_back",
  description: "Navigate back in browser history.",
  category: "ui",
  parameters: browserGoBackSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserGoBackSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.goBack({ timeout: parsed.timeout, waitUntil: "domcontentloaded" });
      const title = await page.title();
      const url = page.url();
      return `Navigated back to: ${url}\nTitle: ${title}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error navigating back: ${msg}`;
    }
  },
};

export const browserGoForwardTool: ToolDefinition = {
  name: "browser_go_forward",
  description: "Navigate forward in browser history.",
  category: "ui",
  parameters: browserGoForwardSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserGoForwardSchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.goForward({ timeout: parsed.timeout, waitUntil: "domcontentloaded" });
      const title = await page.title();
      const url = page.url();
      return `Navigated forward to: ${url}\nTitle: ${title}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error navigating forward: ${msg}`;
    }
  },
};

export const browserPressKeyTool: ToolDefinition = {
  name: "browser_press_key",
  description: "Press a keyboard key (e.g., Enter, Tab, Escape, ArrowDown, Control+a).",
  category: "ui",
  parameters: browserPressKeySchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: false,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserPressKeySchema.parse(args);

    try {
      const page = await browserManager.getPage();
      await page.keyboard.press(parsed.key);
      return `Pressed key: ${parsed.key}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error pressing key ${parsed.key}: ${msg}`;
    }
  },
};

export const browserGetContentTool: ToolDefinition = {
  name: "browser_get_content",
  description: "Get the HTML content of the page or a specific element.",
  category: "ui",
  parameters: browserGetContentSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = browserGetContentSchema.parse(args);

    try {
      const page = await browserManager.getPage();

      if (parsed.selector) {
        const element = await page.$(parsed.selector);
        if (!element) {
          return `Error: Element not found: ${parsed.selector}`;
        }
        const html = await element.innerHTML();
        const truncated = html.length > 5000 ? html.slice(0, 5000) + "\n... (truncated)" : html;
        return `HTML of ${parsed.selector}:\n${truncated}`;
      }

      const html = await page.content();
      const truncated = html.length > 10000 ? html.slice(0, 10000) + "\n... (truncated)" : html;
      return `Page HTML:\n${truncated}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error getting content: ${msg}`;
    }
  },
};

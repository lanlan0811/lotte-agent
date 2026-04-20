import type { ScreenshotResult } from "../types.js";
import { logger } from "../../utils/logger.js";

export class BrowserScreenshot {
  async capture(url: string, options?: { width?: number; height?: number }): Promise<ScreenshotResult> {
    try {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: options?.width ?? 1280, height: options?.height ?? 720 },
      });

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const buffer = await page.screenshot({ type: "png", fullPage: false });
      await browser.close();

      return {
        data: buffer,
        mimeType: "image/png",
        width: options?.width ?? 1280,
        height: options?.height ?? 720,
      };
    } catch (error) {
      logger.error(`Browser screenshot failed: ${error}`);
      throw error;
    }
  }
}

export class ScreenScreenshot {
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async capture(): Promise<ScreenshotResult> {
    if (!this.enabled) {
      throw new Error("Screen screenshot is not enabled");
    }

    try {
      const screenshot = await import("screenshot-desktop" as string);
      const mod = screenshot as { default: (opts: { format: string }) => Promise<Buffer | ArrayBuffer> };
      const result = await mod.default({ format: "png" });
      const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);

      return {
        data: buffer,
        mimeType: "image/png",
        width: 0,
        height: 0,
      };
    } catch (error) {
      logger.error(`Screen screenshot failed: ${error}`);
      throw error;
    }
  }
}

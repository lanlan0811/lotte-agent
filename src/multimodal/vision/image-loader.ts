import fs from "node:fs";
import path from "node:path";
import type { VisionConfig, ImageContent } from "./types.js";
import { logger } from "../utils/logger.js";

export class ImageLoader {
  private config: VisionConfig;

  constructor(config: VisionConfig) {
    this.config = config;
  }

  async loadFromFile(filePath: string): Promise<ImageContent> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size > this.config.max_image_bytes) {
      throw new Error(
        `Image file too large: ${stat.size} bytes (max: ${this.config.max_image_bytes})`,
      );
    }

    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    const mimeType = this.guessMimeType(filePath);

    return {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: "auto",
      },
    };
  }

  async loadFromUrl(url: string): Promise<ImageContent> {
    if (url.startsWith("data:")) {
      return {
        type: "image_url",
        image_url: { url, detail: "auto" },
      };
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > this.config.max_image_bytes) {
        throw new Error(
          `Image too large: ${buffer.length} bytes (max: ${this.config.max_image_bytes})`,
        );
      }

      const contentType = response.headers.get("content-type") ?? "image/png";
      const base64 = buffer.toString("base64");

      return {
        type: "image_url",
        image_url: {
          url: `data:${contentType};base64,${base64}`,
          detail: "auto",
        },
      };
    } catch (error) {
      logger.error(`Failed to load image from URL: ${error}`);
      throw error;
    }
  }

  async loadFromBuffer(buffer: Buffer, mimeType: string): Promise<ImageContent> {
    if (buffer.length > this.config.max_image_bytes) {
      throw new Error(
        `Image too large: ${buffer.length} bytes (max: ${this.config.max_image_bytes})`,
      );
    }

    const base64 = buffer.toString("base64");
    return {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: "auto",
      },
    };
  }

  private guessMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
    };
    return mimeMap[ext] ?? "image/png";
  }
}

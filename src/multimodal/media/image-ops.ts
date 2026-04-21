import fs from "node:fs";
import { logger } from "../../utils/logger.js";

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ImageOpsConfig {
  maxImageBytes: number;
  maxDimension: number;
  qualitySteps: number[];
  defaultQuality: number;
}

const DEFAULT_IMAGE_OPS_CONFIG: ImageOpsConfig = {
  maxImageBytes: 6291456,
  maxDimension: 2048,
  qualitySteps: [85, 75, 65, 55, 45, 35],
  defaultQuality: 80,
};

export class ImageOps {
  private config: ImageOpsConfig;
  private sharpModule: typeof import("sharp") | null = null;
  private sharpLoadAttempted = false;

  constructor(config?: Partial<ImageOpsConfig>) {
    this.config = { ...DEFAULT_IMAGE_OPS_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.sharpLoadAttempted) return;
    this.sharpLoadAttempted = true;

    try {
      const mod = await import("sharp");
      this.sharpModule = (mod.default ?? mod) as typeof import("sharp");
      logger.info("ImageOps: sharp loaded successfully");
    } catch {
      logger.warn("ImageOps: sharp not available, image preprocessing will be limited");
    }
  }

  async preprocess(
    input: Buffer | string,
    options?: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      format?: "jpeg" | "png" | "webp";
    },
  ): Promise<{ data: Buffer; metadata: ImageMetadata }> {
    let buffer: Buffer;

    if (typeof input === "string") {
      if (!fs.existsSync(input)) {
        throw new Error(`Image file not found: ${input}`);
      }
      buffer = fs.readFileSync(input);
    } else {
      buffer = input;
    }

    const rawMetadata = this.readBasicMetadata(buffer);

    if (!this.sharpModule) {
      return {
        data: buffer,
        metadata: rawMetadata ?? {
          width: 0,
          height: 0,
          format: "unknown",
          size: buffer.length,
        },
      };
    }

    const maxWidth = options?.maxWidth ?? this.config.maxDimension;
    const maxHeight = options?.maxHeight ?? this.config.maxDimension;
    const quality = options?.quality ?? this.config.defaultQuality;
    const format = options?.format ?? "jpeg";

    let pipeline = this.sharpModule(buffer, {
      failOnError: false,
      limitInputPixels: 25_000_000,
    });

    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === "png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (format === "webp") {
      pipeline = pipeline.webp({ quality });
    }

    const data = await pipeline.toBuffer();
    const info = await this.sharpModule(data).metadata();

    return {
      data,
      metadata: {
        width: info.width ?? 0,
        height: info.height ?? 0,
        format: info.format ?? "unknown",
        size: data.length,
      },
    };
  }

  async compressToFit(
    input: Buffer | string,
    maxBytes: number,
  ): Promise<{ data: Buffer; metadata: ImageMetadata }> {
    let buffer: Buffer;

    if (typeof input === "string") {
      if (!fs.existsSync(input)) {
        throw new Error(`Image file not found: ${input}`);
      }
      buffer = fs.readFileSync(input);
    } else {
      buffer = input;
    }

    if (buffer.length <= maxBytes) {
      const metadata = this.readBasicMetadata(buffer);
      return {
        data: buffer,
        metadata: metadata ?? { width: 0, height: 0, format: "unknown", size: buffer.length },
      };
    }

    if (!this.sharpModule) {
      logger.warn("Image exceeds size limit but sharp is not available for compression");
      const metadata = this.readBasicMetadata(buffer);
      return {
        data: buffer,
        metadata: metadata ?? { width: 0, height: 0, format: "unknown", size: buffer.length },
      };
    }

    for (const quality of this.config.qualitySteps) {
      const result = await this.preprocess(buffer, { quality, format: "jpeg" });
      if (result.data.length <= maxBytes) {
        return result;
      }
    }

    const maxDim = this.config.maxDimension;
    for (const dim of [1600, 1200, 800, 600, 400]) {
      if (dim >= maxDim) continue;
      const result = await this.preprocess(buffer, {
        maxWidth: dim,
        maxHeight: dim,
        quality: 35,
        format: "jpeg",
      });
      if (result.data.length <= maxBytes) {
        return result;
      }
    }

    logger.warn(`Unable to compress image below ${maxBytes} bytes`);
    const lastResult = await this.preprocess(buffer, {
      maxWidth: 400,
      maxHeight: 400,
      quality: 20,
      format: "jpeg",
    });
    return lastResult;
  }

  async getMetadata(input: Buffer | string): Promise<ImageMetadata | null> {
    let buffer: Buffer;

    if (typeof input === "string") {
      if (!fs.existsSync(input)) {
        return null;
      }
      buffer = fs.readFileSync(input);
    } else {
      buffer = input;
    }

    if (this.sharpModule) {
      try {
        const info = await this.sharpModule(buffer).metadata();
        return {
          width: info.width ?? 0,
          height: info.height ?? 0,
          format: info.format ?? "unknown",
          size: buffer.length,
        };
      } catch {
        // Fall through to basic metadata
      }
    }

    return this.readBasicMetadata(buffer);
  }

  async convertFormat(
    input: Buffer | string,
    format: "jpeg" | "png" | "webp",
    quality?: number,
  ): Promise<Buffer> {
    if (!this.sharpModule) {
      throw new Error("sharp is not available for format conversion");
    }

    let buffer: Buffer;
    if (typeof input === "string") {
      buffer = fs.readFileSync(input);
    } else {
      buffer = input;
    }

    let pipeline = this.sharpModule(buffer, { failOnError: false });

    if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality: quality ?? 80, mozjpeg: true });
    } else if (format === "png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (format === "webp") {
      pipeline = pipeline.webp({ quality: quality ?? 80 });
    }

    return pipeline.toBuffer();
  }

  private readBasicMetadata(buffer: Buffer): ImageMetadata | null {
    if (buffer.length < 8) return null;

    if (
      buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4e && buffer[3] === 0x47
    ) {
      if (buffer.length >= 24 && buffer.toString("ascii", 12, 16) === "IHDR") {
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
          format: "png",
          size: buffer.length,
        };
      }
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      const dims = this.readJpegDimensions(buffer);
      if (dims) {
        return { ...dims, format: "jpeg", size: buffer.length };
      }
    }

    const signature = buffer.toString("ascii", 0, 6);
    if (signature === "GIF87a" || signature === "GIF89a") {
      if (buffer.length >= 10) {
        return {
          width: buffer.readUInt16LE(6),
          height: buffer.readUInt16LE(8),
          format: "gif",
          size: buffer.length,
        };
      }
    }

    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      return {
        width: 0,
        height: 0,
        format: "webp",
        size: buffer.length,
      };
    }

    return null;
  }

  private readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (offset + 9 <= buffer.length) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segLength;
    }
    return null;
  }
}

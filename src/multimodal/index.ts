import type { MultimodalConfig } from "../config/schema.js";
import type { ModelManager } from "../ai/model-manager.js";
import type { ImageContent, ScreenshotResult } from "./types.js";
import { VisionRunner } from "./vision/vision-runner.js";
import { ImageLoader } from "./vision/image-loader.js";
import { VideoRunner } from "./video/video-runner.js";
import { BrowserScreenshot, ScreenScreenshot } from "./screenshot/screenshot.js";
import { MediaStore } from "./media/store.js";
import { MediaServer } from "./media/server.js";
import { ImageOps } from "./media/image-ops.js";
import { parseMediaTokens, extractMediaUrls, stripMediaTokens, buildMediaHttpUrl, replaceMediaTokensWithHttpUrls } from "./media/parse.js";
import { logger } from "../utils/logger.js";

export { parseMediaTokens, extractMediaUrls, stripMediaTokens, buildMediaToken, buildMediaHttpUrl, replaceMediaTokensWithHttpUrls } from "./media/parse.js";
export { ImageOps } from "./media/image-ops.js";
export { MediaStore, registerMediaRoutes } from "./media/store.js";
export { MediaServer, resolveMediaUrl } from "./media/server.js";
export type { ImageMetadata, ImageOpsConfig } from "./media/image-ops.js";
export type { ParsedMediaSegment } from "./media/parse.js";

export class MultimodalManager {
  private config: MultimodalConfig;
  private visionRunner: VisionRunner;
  private imageLoader: ImageLoader;
  private videoRunner: VideoRunner;
  private browserScreenshot: BrowserScreenshot;
  private screenScreenshot: ScreenScreenshot;
  private mediaStore: MediaStore;
  private mediaServer: MediaServer | null = null;
  private imageOps: ImageOps;
  private gatewayMode = false;

  constructor(config: MultimodalConfig, modelManager: ModelManager, dataDir: string) {
    this.config = config;

    this.visionRunner = new VisionRunner(config.vision, modelManager);
    this.imageLoader = new ImageLoader(config.vision);
    this.videoRunner = new VideoRunner(config.video, config.vision.max_image_bytes);
    this.browserScreenshot = new BrowserScreenshot();
    this.screenScreenshot = new ScreenScreenshot(config.screenshot.screen_enabled);

    this.mediaStore = new MediaStore({
      storage_dir: config.media.storage_dir || `${dataDir}/media`,
      ttl_seconds: config.media.ttl_seconds,
      http_port: config.media.http_port,
    });

    this.imageOps = new ImageOps({
      maxImageBytes: config.vision.max_image_bytes,
    });
  }

  initialize(opts?: { gatewayMode?: boolean }): void {
    this.gatewayMode = opts?.gatewayMode ?? false;

    this.mediaStore.initialize();
    this.imageOps.initialize().catch((error) => {
      logger.warn(`ImageOps initialization warning: ${error}`);
    });

    if (!this.gatewayMode && this.config.media.http_port) {
      this.mediaServer = new MediaServer(this.mediaStore, { port: this.config.media.http_port });
      this.mediaServer.start().catch((error) => {
        logger.warn(`Media server failed to start: ${error}`);
        this.mediaServer = null;
      });
    }

    if (this.gatewayMode) {
      logger.info("Multimodal manager initialized (gateway mode — media routes via Fastify)");
    } else {
      logger.info("Multimodal manager initialized");
    }
  }

  async analyzeImage(
    source: string | Buffer,
    prompt: string,
    options?: { mimeType?: string; model?: string },
  ): Promise<string> {
    return this.visionRunner.analyzeImage(source, prompt, options);
  }

  async loadImage(source: string | Buffer, options?: { mimeType?: string }): Promise<ImageContent> {
    if (Buffer.isBuffer(source)) {
      return this.imageLoader.loadFromBuffer(source, options?.mimeType ?? "image/png");
    }
    if (source.startsWith("http") || source.startsWith("data:")) {
      return this.imageLoader.loadFromUrl(source);
    }
    return this.imageLoader.loadFromFile(source);
  }

  async extractVideoKeyframes(videoPath: string, intervalSeconds?: number): Promise<ImageContent[]> {
    return this.videoRunner.extractKeyframes(videoPath, intervalSeconds);
  }

  async captureBrowserScreenshot(url: string, options?: { width?: number; height?: number }): Promise<ScreenshotResult> {
    if (!this.config.screenshot.browser_enabled) {
      throw new Error("Browser screenshot is not enabled");
    }
    return this.browserScreenshot.capture(url, options);
  }

  async captureScreenScreenshot(): Promise<ScreenshotResult> {
    return this.screenScreenshot.capture();
  }

  storeMedia(data: Buffer, mimeType: string, filename?: string) {
    return this.mediaStore.store(data, mimeType, filename);
  }

  getMedia(id: string): Buffer | null {
    return this.mediaStore.get(id);
  }

  getMediaMetadata(id: string) {
    return this.mediaStore.getMetadata(id);
  }

  getMediaStore(): MediaStore {
    return this.mediaStore;
  }

  getImageOps(): ImageOps {
    return this.imageOps;
  }

  isGatewayMode(): boolean {
    return this.gatewayMode;
  }

  getMediaHttpPort(): number {
    return this.config.media.http_port;
  }

  buildMediaUrl(mediaId: string, gatewayPort?: number): string {
    if (this.gatewayMode && gatewayPort) {
      return `http://127.0.0.1:${gatewayPort}/media/${mediaId}`;
    }
    return buildMediaHttpUrl(mediaId, this.config.media.http_port);
  }

  parseMediaTokens(text: string) {
    return parseMediaTokens(text);
  }

  extractMediaUrls(text: string) {
    return extractMediaUrls(text);
  }

  stripMediaTokens(text: string) {
    return stripMediaTokens(text);
  }

  replaceMediaTokensWithHttpUrls(
    text: string,
    resolveMediaId: (url: string) => string | null,
    port?: number,
  ): string {
    const effectivePort = port ?? this.config.media.http_port;
    return replaceMediaTokensWithHttpUrls(text, resolveMediaId, effectivePort);
  }

  async preprocessImage(
    input: Buffer | string,
    options?: { maxWidth?: number; maxHeight?: number; quality?: number; format?: "jpeg" | "png" | "webp" },
  ) {
    return this.imageOps.preprocess(input, options);
  }

  async compressImageToFit(input: Buffer | string, maxBytes: number) {
    return this.imageOps.compressToFit(input, maxBytes);
  }

  shutdown(): void {
    this.mediaStore.shutdown();
    if (this.mediaServer) {
      this.mediaServer.stop();
    }
  }
}

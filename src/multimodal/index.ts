import type { MultimodalConfig } from "../config/schema.js";
import type { ModelManager } from "../ai/model-manager.js";
import type { ImageContent, ScreenshotResult } from "./types.js";
import { VisionRunner } from "./vision/vision-runner.js";
import { ImageLoader } from "./vision/image-loader.js";
import { VideoRunner } from "./video/video-runner.js";
import { BrowserScreenshot, ScreenScreenshot } from "./screenshot/screenshot.js";
import { MediaStore, MediaServer } from "./media/store.js";
import { logger } from "../utils/logger.js";

export class MultimodalManager {
  private config: MultimodalConfig;
  private _modelManager: ModelManager;
  private visionRunner: VisionRunner;
  private imageLoader: ImageLoader;
  private videoRunner: VideoRunner;
  private browserScreenshot: BrowserScreenshot;
  private screenScreenshot: ScreenScreenshot;
  private mediaStore: MediaStore;
  private mediaServer: MediaServer | null = null;

  constructor(config: MultimodalConfig, modelManager: ModelManager, dataDir: string) {
    this.config = config;
    this._modelManager = modelManager;

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
  }

  initialize(): void {
    this.mediaStore.initialize();

    if (this.config.media.http_port) {
      this.mediaServer = new MediaServer(this.mediaStore, this.config.media.http_port);
      this.mediaServer.start().catch((error) => {
        logger.warn(`Media server failed to start: ${error}`);
        this.mediaServer = null;
      });
    }

    logger.info("Multimodal manager initialized");
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

  shutdown(): void {
    this.mediaStore.shutdown();
    if (this.mediaServer) {
      this.mediaServer.stop();
    }
  }
}

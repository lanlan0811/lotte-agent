import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { VideoConfig, ImageContent } from "../types.js";
import { ImageLoader } from "../vision/image-loader.js";
import { logger } from "../../utils/logger.js";

const execFileAsync = promisify(execFile);

export class VideoRunner {
  private config: VideoConfig;
  private imageLoader: ImageLoader;

  constructor(config: VideoConfig, visionMaxImageBytes: number) {
    this.config = config;
    this.imageLoader = new ImageLoader({
      enabled: true,
      follow_primary_model: true,
      max_image_bytes: visionMaxImageBytes,
      max_images_per_message: 20,
    });
  }

  async extractKeyframes(videoPath: string, intervalSeconds = 10): Promise<ImageContent[]> {
    if (!this.config.enabled) {
      throw new Error("Video understanding is not enabled");
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const stat = fs.statSync(videoPath);
    if (stat.size > this.config.max_video_bytes) {
      throw new Error(
        `Video file too large: ${stat.size} bytes (max: ${this.config.max_video_bytes})`,
      );
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lotte-video-"));
    const outputPattern = path.join(tmpDir, "frame_%04d.jpg");

    try {
      await this.runFfmpeg([
        "-i",
        videoPath,
        "-vf",
        `fps=1/${intervalSeconds}`,
        "-q:v",
        "2",
        outputPattern,
      ]);

      const frames = fs
        .readdirSync(tmpDir)
        .filter((f) => f.endsWith(".jpg"))
        .sort()
        .map((f) => path.join(tmpDir, f));

      const images: ImageContent[] = [];
      for (const framePath of frames) {
        try {
          const image = await this.imageLoader.loadFromFile(framePath);
          images.push(image);
        } catch (error) {
          logger.debug(`Failed to load frame ${framePath}: ${error}`);
        }
      }

      return images;
    } catch (error) {
      logger.error(`Video keyframe extraction failed: ${error}`);
      throw new Error(
        `Failed to extract video keyframes. Ensure ffmpeg is installed. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private async runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("ffmpeg", args, { timeout: 60000 });
  }
}

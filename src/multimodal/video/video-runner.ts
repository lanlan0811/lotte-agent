import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { VideoConfig, ImageContent } from "../types.js";
import { ImageLoader } from "../vision/image-loader.js";
import { logger } from "../../utils/logger.js";

const execFileAsync = promisify(execFile);

const FFPROBE_TIMEOUT_MS = 10_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const MAX_KEYFRAMES = 20;
const MIN_INTERVAL_SECONDS = 2;
const MAX_INTERVAL_SECONDS = 60;

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
}

export interface ExtractionProgress {
  phase: "probing" | "extracting" | "loading";
  current: number;
  total: number;
  percent: number;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;

export class VideoRunner {
  private config: VideoConfig;
  private imageLoader: ImageLoader;

  constructor(config: VideoConfig, visionMaxImageBytes: number) {
    this.config = config;
    this.imageLoader = new ImageLoader({
      enabled: true,
      follow_primary_model: true,
      max_image_bytes: visionMaxImageBytes,
      max_images_per_message: MAX_KEYFRAMES,
    });
  }

  async extractKeyframes(
    videoPath: string,
    intervalSeconds?: number,
    onProgress?: ProgressCallback,
  ): Promise<ImageContent[]> {
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

    onProgress?.({ phase: "probing", current: 0, total: 1, percent: 0 });

    const metadata = await this.probeVideo(videoPath);

    if (metadata.durationSeconds <= 0) {
      throw new Error("Unable to determine video duration");
    }

    if (metadata.durationSeconds > this.config.max_duration_seconds) {
      throw new Error(
        `Video too long: ${metadata.durationSeconds.toFixed(1)}s (max: ${this.config.max_duration_seconds}s)`,
      );
    }

    const effectiveInterval = this.computeAdaptiveInterval(
      metadata.durationSeconds,
      intervalSeconds,
    );

    const estimatedFrames = Math.ceil(metadata.durationSeconds / effectiveInterval);

    logger.info(
      `Video: ${metadata.durationSeconds.toFixed(1)}s, ${metadata.width}x${metadata.height}, ` +
      `interval=${effectiveInterval}s, estimated ~${estimatedFrames} frames`,
    );

    onProgress?.({ phase: "extracting", current: 0, total: estimatedFrames, percent: 0 });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lotte-video-"));
    const outputPattern = path.join(tmpDir, "frame_%04d.jpg");

    try {
      await this.runFfmpeg([
        "-i",
        videoPath,
        "-vf",
        `fps=1/${effectiveInterval}`,
        "-q:v",
        "2",
        "-frames:v",
        String(MAX_KEYFRAMES),
        outputPattern,
      ]);

      const frames = fs
        .readdirSync(tmpDir)
        .filter((f) => f.endsWith(".jpg"))
        .sort()
        .map((f) => path.join(tmpDir, f));

      const images: ImageContent[] = [];
      for (let i = 0; i < frames.length; i++) {
        const framePath = frames[i]!;
        try {
          onProgress?.({
            phase: "loading",
            current: i + 1,
            total: frames.length,
            percent: Math.round(((i + 1) / frames.length) * 100),
          });

          const image = await this.imageLoader.loadFromFile(framePath);
          images.push(image);
        } catch (error) {
          logger.debug(`Failed to load frame ${framePath}: ${error}`);
        }
      }

      logger.info(`Extracted ${images.length}/${frames.length} keyframes from video`);
      return images;
    } catch (error) {
      logger.error(`Video keyframe extraction failed: ${error}`);
      throw new Error(
        `Failed to extract video keyframes. Ensure ffmpeg is installed. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        logger.debug(`Video runner: Failed to cleanup temp dir: ${e}`);
      }
    }
  }

  async probeVideo(videoPath: string): Promise<VideoMetadata> {
    try {
      const { stdout } = await this.runFfprobe([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "-select_streams",
        "v:0",
        videoPath,
      ]);

      const probe = JSON.parse(stdout) as {
        format?: { duration?: string; bit_rate?: string };
        streams?: Array<{
          width?: number;
          height?: number;
          codec_name?: string;
          duration?: string;
        }>;
      };

      const videoStream = probe.streams?.[0];
      const durationStr = videoStream?.duration || probe.format?.duration;
      const durationSeconds = durationStr ? parseFloat(durationStr) : 0;

      return {
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        codec: videoStream?.codec_name ?? "unknown",
        bitrate: probe.format?.bit_rate ? parseInt(probe.format.bit_rate, 10) : 0,
      };
    } catch (error) {
      logger.warn(`ffprobe failed for ${videoPath}: ${error}`);
      return {
        durationSeconds: 0,
        width: 0,
        height: 0,
        codec: "unknown",
        bitrate: 0,
      };
    }
  }

  private computeAdaptiveInterval(
    durationSeconds: number,
    requestedInterval?: number,
  ): number {
    if (requestedInterval !== undefined) {
      return Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, requestedInterval));
    }

    const intervalFromMaxFrames = durationSeconds / MAX_KEYFRAMES;

    if (intervalFromMaxFrames <= MIN_INTERVAL_SECONDS) {
      return MIN_INTERVAL_SECONDS;
    }

    if (intervalFromMaxFrames >= MAX_INTERVAL_SECONDS) {
      return MAX_INTERVAL_SECONDS;
    }

    const rounded = Math.ceil(intervalFromMaxFrames);
    return Math.min(rounded, MAX_INTERVAL_SECONDS);
  }

  private async runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("ffmpeg", args, {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  private async runFfprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("ffprobe", args, {
      timeout: FFPROBE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}

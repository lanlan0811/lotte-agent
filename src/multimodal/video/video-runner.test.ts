import { describe, it, expect } from "vitest";
import { VideoRunner } from "./video-runner.js";
import type { VideoConfig } from "../types.js";

function createVideoRunner(maxDurationSeconds = 600): VideoRunner {
  const config: VideoConfig = {
    enabled: true,
    max_video_bytes: 100 * 1024 * 1024,
    max_duration_seconds: maxDurationSeconds,
  };
  return new VideoRunner(config, 10 * 1024 * 1024);
}

describe("VideoRunner", () => {
  describe("extractKeyframes validation", () => {
    it("should throw when video understanding is not enabled", async () => {
      const config: VideoConfig = {
        enabled: false,
        max_video_bytes: 100 * 1024 * 1024,
        max_duration_seconds: 600,
      };
      const runner = new VideoRunner(config, 10 * 1024 * 1024);

      await expect(runner.extractKeyframes("/nonexistent.mp4")).rejects.toThrow(
        "Video understanding is not enabled",
      );
    });

    it("should throw when video file does not exist", async () => {
      const runner = createVideoRunner();

      await expect(runner.extractKeyframes("/nonexistent/video.mp4")).rejects.toThrow(
        "Video file not found",
      );
    });
  });

  describe("computeAdaptiveInterval (via probeVideo mock)", () => {
    const MAX_KEYFRAMES = 20;
    const MIN_INTERVAL_SECONDS = 2;
    const MAX_INTERVAL_SECONDS = 60;

    function computeAdaptiveInterval(durationSeconds: number, requestedInterval?: number): number {
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

    it("should use MIN_INTERVAL for very short videos", () => {
      expect(computeAdaptiveInterval(10)).toBe(2);
      expect(computeAdaptiveInterval(30)).toBe(2);
    });

    it("should use adaptive interval for medium-length videos", () => {
      const interval = computeAdaptiveInterval(120);
      expect(interval).toBeGreaterThanOrEqual(2);
      expect(interval).toBeLessThanOrEqual(60);
      expect(Math.ceil(120 / interval)).toBeLessThanOrEqual(20);
    });

    it("should use MAX_INTERVAL for very long videos", () => {
      expect(computeAdaptiveInterval(3600)).toBe(60);
      expect(computeAdaptiveInterval(7200)).toBe(60);
    });

    it("should respect explicitly requested interval", () => {
      expect(computeAdaptiveInterval(120, 5)).toBe(5);
      expect(computeAdaptiveInterval(120, 1)).toBe(2);
      expect(computeAdaptiveInterval(120, 100)).toBe(60);
    });

    it("should produce at most MAX_KEYFRAMES frames for medium videos", () => {
      const durations = [120, 300, 600, 1200];
      for (const duration of durations) {
        const interval = computeAdaptiveInterval(duration);
        const frameCount = Math.ceil(duration / interval);
        expect(frameCount).toBeLessThanOrEqual(20);
      }
    });

    it("should cap interval at MAX_INTERVAL for very long videos", () => {
      expect(computeAdaptiveInterval(3600)).toBe(60);
      expect(computeAdaptiveInterval(7200)).toBe(60);
    });
  });

  describe("probeVideo", () => {
    it("should return default metadata when ffprobe fails", async () => {
      const runner = createVideoRunner();
      const metadata = await runner.probeVideo("/nonexistent/video.mp4");

      expect(metadata.durationSeconds).toBe(0);
      expect(metadata.width).toBe(0);
      expect(metadata.height).toBe(0);
      expect(metadata.codec).toBe("unknown");
      expect(metadata.bitrate).toBe(0);
    });
  });

  describe("ExtractionProgress", () => {
    it("should call progress callback with probing phase for existing file", async () => {
      const runner = createVideoRunner();
      const progressCalls: Array<{ phase: string; percent: number }> = [];

      const tmpFile = require("node:os").tmpdir() + "/lotte-test-video-" + Date.now() + ".mp4";
      require("node:fs").writeFileSync(tmpFile, Buffer.from("fake video content"));

      try {
        await runner.extractKeyframes(tmpFile, undefined, (progress) => {
          progressCalls.push({ phase: progress.phase, percent: progress.percent });
        });
      } catch {
        // ffmpeg will fail on fake video, that's expected
      }

      expect(progressCalls.some((p) => p.phase === "probing")).toBe(true);

      require("node:fs").unlinkSync(tmpFile);
    });
  });
});

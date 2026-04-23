import type { ModelManager } from "./model-manager.js";
import type { ContentPart } from "./types.js";
import { logger } from "../utils/logger.js";

const PROBE_IMAGE_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJ0lEQVR42u3NsQkAAAjA" +
  "sP7/tF7hIASyp6lTCQQCgUAgEAgEgi/BAjLD/C5w/SM9AAAAAElFTkSuQmCC";

const PROBE_IMAGE_URL = `data:image/png;base64,${PROBE_IMAGE_B64}`;

const RED_KEYWORDS = ["red", "scarlet", "crimson", "vermilion", "maroon", "红"];
const MEDIA_ERROR_KEYWORDS = [
  "image",
  "video",
  "vision",
  "multimodal",
  "image_url",
  "video_url",
  "does not support",
];

export interface ProbeResult {
  supportsImage: boolean;
  supportsVideo: boolean;
  imageMessage: string;
  videoMessage: string;
}

function isMediaKeywordError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  return MEDIA_ERROR_KEYWORDS.some((kw) => errorStr.includes(kw));
}

export class MultimodalProber {
  private modelManager: ModelManager;
  private cache: Map<string, ProbeResult> = new Map();
  private probing: Map<string, Promise<ProbeResult>> = new Map();

  constructor(modelManager: ModelManager) {
    this.modelManager = modelManager;
  }

  async probe(modelId: string, timeout = 15000): Promise<ProbeResult> {
    const cached = this.cache.get(modelId);
    if (cached) return cached;

    const inFlight = this.probing.get(modelId);
    if (inFlight) return inFlight;

    const promise = this._doProbe(modelId, timeout);
    this.probing.set(modelId, promise);

    try {
      const result = await promise;
      this.cache.set(modelId, result);
      return result;
    } finally {
      this.probing.delete(modelId);
    }
  }

  getCached(modelId: string): ProbeResult | undefined {
    return this.cache.get(modelId);
  }

  clearCache(modelId?: string): void {
    if (modelId) {
      this.cache.delete(modelId);
    } else {
      this.cache.clear();
    }
  }

  private async _doProbe(modelId: string, timeout: number): Promise<ProbeResult> {
    logger.info(`Multimodal probe start: model=${modelId}`);

    const imageResult = await this.probeImage(modelId, timeout);
    if (!imageResult.supportsImage) {
      logger.info(`Multimodal probe done: model=${modelId} image=false, skipping video`);
      return {
        supportsImage: false,
        supportsVideo: false,
        imageMessage: imageResult.message,
        videoMessage: "Skipped: image not supported",
      };
    }

    const videoResult = await this.probeVideo(modelId, timeout);
    logger.info(
      `Multimodal probe done: model=${modelId} image=true video=${videoResult.supportsVideo}`,
    );

    return {
      supportsImage: true,
      supportsVideo: videoResult.supportsVideo,
      imageMessage: imageResult.message,
      videoMessage: videoResult.message,
    };
  }

  private async probeImage(
    modelId: string,
    _timeout: number,
  ): Promise<{ supportsImage: boolean; message: string }> {
    const content: ContentPart[] = [
      {
        type: "image_url",
        image_url: { url: PROBE_IMAGE_URL, detail: "low" },
      },
      {
        type: "text",
        text: "What is the single dominant color of this image? Reply with ONLY the color name, nothing else.",
      },
    ];

    try {
      const response = await this.modelManager.chat({
        model: modelId,
        messages: [{ role: "user", content }],
        max_tokens: 200,
      });

      const answer = (response.choices[0]?.message?.content ?? "").toLowerCase().trim();

      if (RED_KEYWORDS.some((kw) => answer.includes(kw))) {
        return { supportsImage: true, message: `Image supported (answer=${answer})` };
      }

      return {
        supportsImage: false,
        message: `Image not confirmed (answer=${answer})`,
      };
    } catch (error) {
      const msg = String(error);
      logger.warn(`Image probe error: model=${modelId} error=${msg}`);

      if (isMediaKeywordError(error)) {
        return { supportsImage: false, message: `Image not supported: ${msg}` };
      }

      return { supportsImage: false, message: `Probe inconclusive: ${msg}` };
    }
  }

  private async probeVideo(
    modelId: string,
    _timeout: number,
  ): Promise<{ supportsVideo: boolean; message: string }> {
    const content: ContentPart[] = [
      {
        type: "text",
        text: "Can you process video content? Reply with ONLY 'yes' or 'no'.",
      },
    ];

    try {
      const response = await this.modelManager.chat({
        model: modelId,
        messages: [{ role: "user", content }],
        max_tokens: 50,
      });

      const answer = (response.choices[0]?.message?.content ?? "").toLowerCase().trim();

      if (answer.includes("yes")) {
        return { supportsVideo: true, message: `Video likely supported (answer=${answer})` };
      }

      return {
        supportsVideo: false,
        message: `Video not confirmed (answer=${answer})`,
      };
    } catch (error) {
      const msg = String(error);
      logger.warn(`Video probe error: model=${modelId} error=${msg}`);

      if (isMediaKeywordError(error)) {
        return { supportsVideo: false, message: `Video not supported: ${msg}` };
      }

      return { supportsVideo: false, message: `Probe inconclusive: ${msg}` };
    }
  }
}

import { describe, it, expect, vi } from "vitest";
import { MultimodalProber } from "./multimodal-prober.js";
import type { ModelManager } from "./model-manager.js";

function createMockModelManager(responses: {
  image?: { content: string };
  video?: { content: string };
  imageError?: Error;
  videoError?: Error;
}): ModelManager {
  return {
    chat: vi.fn().mockImplementation((params: { messages: Array<{ role: string; content: unknown }> }) => {
      const userMsg = params.messages.find((m) => m.role === "user");
      const content = userMsg?.content;
      const isImageProbe = Array.isArray(content) && content.some((p: Record<string, unknown>) => p.type === "image_url");
      const isVideoProbe = Array.isArray(content) && content.some((p: Record<string, unknown>) => p.type === "text" && (p as { text: string }).text?.includes("video"));

      if (isImageProbe) {
        if (responses.imageError) throw responses.imageError;
        return {
          choices: [{
            message: { content: responses.image?.content ?? "red" },
          }],
        };
      }

      if (isVideoProbe) {
        if (responses.videoError) throw responses.videoError;
        return {
          choices: [{
            message: { content: responses.video?.content ?? "yes" },
          }],
        };
      }

      return {
        choices: [{ message: { content: "unknown" } }],
      };
    }),
  } as unknown as ModelManager;
}

describe("MultimodalProber", () => {
  it("should detect image support when model recognizes color", async () => {
    const mm = createMockModelManager({ image: { content: "red" } });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsImage).toBe(true);
    expect(result.imageMessage).toContain("Image supported");
  });

  it("should detect no image support when model gives unrelated answer", async () => {
    const mm = createMockModelManager({ image: { content: "I cannot see images" } });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsImage).toBe(false);
    expect(result.imageMessage).toContain("Image not confirmed");
  });

  it("should detect no image support when model throws media error", async () => {
    const mm = createMockModelManager({
      imageError: new Error("This model does not support image input"),
    });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsImage).toBe(false);
    expect(result.imageMessage).toContain("Image not supported");
  });

  it("should detect video support when model says yes", async () => {
    const mm = createMockModelManager({ video: { content: "yes" } });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsVideo).toBe(true);
    expect(result.videoMessage).toContain("Video likely supported");
  });

  it("should detect no video support when model says no", async () => {
    const mm = createMockModelManager({ video: { content: "no" } });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsVideo).toBe(false);
    expect(result.videoMessage).toContain("Video not confirmed");
  });

  it("should detect no video support when model throws media error", async () => {
    const mm = createMockModelManager({
      videoError: new Error("This model does not support video content"),
    });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("test-model");

    expect(result.supportsVideo).toBe(false);
    expect(result.videoMessage).toContain("Video not supported");
  });

  it("should cache probe results", async () => {
    const mm = createMockModelManager({ image: { content: "red" }, video: { content: "yes" } });
    const prober = new MultimodalProber(mm);

    const result1 = await prober.probe("cache-model");
    const result2 = await prober.probe("cache-model");

    expect(result1).toBe(result2);
    expect(mm.chat).toHaveBeenCalledTimes(2);
  });

  it("should deduplicate concurrent probes for same model", async () => {
    const mm = createMockModelManager({ image: { content: "red" }, video: { content: "yes" } });
    const prober = new MultimodalProber(mm);

    const [result1, result2] = await Promise.all([
      prober.probe("dedup-model"),
      prober.probe("dedup-model"),
    ]);

    expect(result1).toEqual(result2);
    expect(mm.chat).toHaveBeenCalledTimes(2);
  });

  it("should return inconclusive for non-media image errors and skip video", async () => {
    const mm = createMockModelManager({
      imageError: new Error("Rate limit exceeded"),
    });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("error-model");

    expect(result.supportsImage).toBe(false);
    expect(result.imageMessage).toContain("Probe inconclusive");
    expect(result.supportsVideo).toBe(false);
    expect(result.videoMessage).toContain("Skipped");
  });

  it("should recognize Chinese color keyword for image support", async () => {
    const mm = createMockModelManager({ image: { content: "红色" } });
    const prober = new MultimodalProber(mm);

    const result = await prober.probe("chinese-model");

    expect(result.supportsImage).toBe(true);
    expect(result.imageMessage).toContain("Image supported");
  });
});

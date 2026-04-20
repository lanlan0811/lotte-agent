import type { ModelManager } from "../../ai/model-manager.js";
import type { ChatMessage } from "../../ai/types.js";
import type { VisionConfig, ImageContent } from "../types.js";
import { ImageLoader } from "./image-loader.js";
import { logger } from "../../utils/logger.js";

export class VisionRunner {
  private config: VisionConfig;
  private modelManager: ModelManager;
  private imageLoader: ImageLoader;

  constructor(config: VisionConfig, modelManager: ModelManager) {
    this.config = config;
    this.modelManager = modelManager;
    this.imageLoader = new ImageLoader(config);
  }

  async analyzeImage(
    imageSource: string | Buffer,
    prompt: string,
    options?: { mimeType?: string; model?: string },
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error("Vision is not enabled");
    }

    const imageContent: ImageContent = Buffer.isBuffer(imageSource)
      ? await this.imageLoader.loadFromBuffer(imageSource, options?.mimeType ?? "image/png")
      : imageSource.startsWith("http") || imageSource.startsWith("data:")
        ? await this.imageLoader.loadFromUrl(imageSource)
        : await this.imageLoader.loadFromFile(imageSource);

    void imageContent;

    const model = options?.model ?? this.modelManager.getDefaultModel();

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: prompt,
      },
    ];

    try {
      const response = await this.modelManager.chat({
        model,
        messages,
      });

      const content = response.choices[0]?.message?.content;
      return content ?? "No response from vision model";
    } catch (error) {
      logger.error(`Vision analysis error: ${error}`);
      throw error;
    }
  }

  buildMultimodalMessage(prompt: string, images: ImageContent[]): ChatMessage {
    return {
      role: "user",
      content: JSON.stringify({
        text: prompt,
        images: images.map((img) => img.image_url.url),
      }),
    };
  }
}

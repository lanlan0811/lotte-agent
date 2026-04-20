import type { ModelManager } from "../../ai/model-manager.js";
import type { ChatMessage, ToolDefinition } from "../../ai/types.js";
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

    let imageContent: ImageContent;
    if (Buffer.isBuffer(imageSource)) {
      imageContent = await this.imageLoader.loadFromBuffer(
        imageSource,
        options?.mimeType ?? "image/png",
      );
    } else if (imageSource.startsWith("http") || imageSource.startsWith("data:")) {
      imageContent = await this.imageLoader.loadFromUrl(imageSource);
    } else {
      imageContent = await this.imageLoader.loadFromFile(imageSource);
    }

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
        tools: this.buildVisionTools(imageContent),
      });

      const content = response.choices[0]?.message?.content;
      return content ?? "No response from vision model";
    } catch (error) {
      logger.error(`Vision analysis error: ${error}`);
      throw error;
    }
  }

  private buildVisionTools(imageContent: ImageContent): ToolDefinition[] | undefined {
    return undefined;
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

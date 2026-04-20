import type { AIProvider } from "./provider.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelInfo,
  StreamCallback,
} from "./types.js";
import type { AIConfig } from "../config/schema.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { CustomProvider } from "./custom-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { logger } from "../utils/logger.js";

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_OUTPUT = 16384;

export class ModelManager {
  private providers: Map<string, AIProvider> = new Map();
  private modelAliases: Map<string, string> = new Map();
  private defaultProvider: string;
  private defaultModel: string;

  constructor(aiConfig: AIConfig) {
    this.defaultProvider = aiConfig.default_provider;
    this.defaultModel = aiConfig.default_model;

    for (const [providerId, providerConfig] of Object.entries(aiConfig.providers)) {
      if (!providerConfig.api_key) {
        logger.debug(`Provider ${providerId} has no API key, skipping`);
        continue;
      }

      const provider = this.createProvider(providerId, {
        apiUrl: providerConfig.api_url,
        apiKey: providerConfig.api_key,
        models: providerConfig.models,
      });

      if (provider) {
        this.providers.set(providerId, provider);
        logger.debug(`Registered provider: ${providerId}`);
      }
    }

    for (const [alias, target] of Object.entries(aiConfig.model_aliases)) {
      this.modelAliases.set(alias, target);
    }
  }

  private createProvider(
    providerId: string,
    config: { apiUrl: string; apiKey: string; models: Record<string, { context_window: number; max_output: number }> },
  ): AIProvider | null {
    switch (providerId) {
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "gemini":
        return new GeminiProvider(config);
      case "custom":
        return new CustomProvider(config);
      default:
        return new CustomProvider(config);
    }
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { provider, model } = this.resolveProviderAndModel(request.model);
    const providerInstance = this.getProvider(provider);

    const enrichedRequest = {
      ...request,
      model,
    };

    return providerInstance.chat(enrichedRequest);
  }

  async chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse> {
    const { provider, model } = this.resolveProviderAndModel(request.model);
    const providerInstance = this.getProvider(provider);

    const enrichedRequest = {
      ...request,
      model,
    };

    return providerInstance.chatStream(enrichedRequest, callback);
  }

  resolveModel(modelId: string): { provider: string; model: string } {
    return this.resolveProviderAndModel(modelId);
  }

  getModelInfo(modelId: string): ModelInfo | undefined {
    const { provider, model } = this.resolveProviderAndModel(modelId);
    const providerInstance = this.providers.get(provider);
    if (!providerInstance) return undefined;
    return providerInstance.getModel(model);
  }

  getContextWindow(modelId: string): number {
    const info = this.getModelInfo(modelId);
    return info?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  }

  getMaxOutput(modelId: string): number {
    const info = this.getModelInfo(modelId);
    return info?.maxOutput ?? DEFAULT_MAX_OUTPUT;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  getDefaultProvider(): string {
    return this.defaultProvider;
  }

  listAllModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.listModels());
    }
    return models;
  }

  getProvider(providerId: string): AIProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    return provider;
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private resolveProviderAndModel(modelId: string): { provider: string; model: string } {
    const resolved = this.modelAliases.get(modelId);
    if (resolved) {
      return this.parseQualifiedModelId(resolved);
    }

    if (modelId.includes("/")) {
      return this.parseQualifiedModelId(modelId);
    }

    return { provider: this.defaultProvider, model: modelId };
  }

  private parseQualifiedModelId(qualifiedId: string): { provider: string; model: string } {
    const slashIndex = qualifiedId.indexOf("/");
    if (slashIndex === -1) {
      return { provider: this.defaultProvider, model: qualifiedId };
    }

    const provider = qualifiedId.slice(0, slashIndex);
    const model = qualifiedId.slice(slashIndex + 1);
    return { provider, model };
  }
}

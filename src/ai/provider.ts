import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamCallback,
  ModelInfo,
  ProviderConfig,
} from "./types.js";

export interface AIProvider {
  readonly id: string;
  readonly name: string;

  listModels(): ModelInfo[];
  getModel(modelId: string): ModelInfo | undefined;

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse>;

  validateConfig(): boolean;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  abstract chatStream(
    request: ChatCompletionRequest,
    callback: StreamCallback,
  ): Promise<ChatCompletionResponse>;

  listModels(): ModelInfo[] {
    return Object.entries(this.config.models).map(([id, model]) => ({
      id,
      provider: this.id,
      contextWindow: model.context_window,
      maxOutput: model.max_output,
    }));
  }

  getModel(modelId: string): ModelInfo | undefined {
    const modelConfig = this.config.models[modelId];
    if (!modelConfig) return undefined;
    return {
      id: modelId,
      provider: this.id,
      contextWindow: modelConfig.context_window,
      maxOutput: modelConfig.max_output,
    };
  }

  validateConfig(): boolean {
    return !!this.config.apiUrl && !!this.config.apiKey;
  }

  protected getApiKey(): string {
    return this.config.apiKey;
  }

  protected getApiUrl(): string {
    return this.config.apiUrl;
  }
}

import crypto from "node:crypto";
import OpenAI from "openai";
import type { EmbeddingProvider, EmbeddingConfig } from "./types.js";
import { logger } from "../utils/logger.js";

export function sanitizeAndNormalizeEmbedding(vec: number[]): number[] {
  const sanitized = vec.map((value) => (Number.isFinite(value) ? value : 0));
  const magnitude = Math.sqrt(sanitized.reduce((sum, value) => sum + value * value, 0));
  if (magnitude < 1e-10) {
    return sanitized;
  }
  return sanitized.map((value) => value / magnitude);
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  private client: OpenAI;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingConfig, apiUrl?: string, apiKey?: string) {
    this.id = config.provider;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: apiKey || undefined,
      baseURL: apiUrl || undefined,
    });
  }

  async embedQuery(text: string): Promise<number[]> {
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.getCacheKey(texts[i]);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    if (uncachedTexts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        try {
          const response = await this.client.embeddings.create({
            model: this.model,
            input: batch,
          });

          for (let j = 0; j < response.data.length; j++) {
            const embedding = sanitizeAndNormalizeEmbedding(response.data[j].embedding);
            const originalIndex = uncachedIndices[i + j];
            results[originalIndex] = embedding;

            const cacheKey = this.getCacheKey(batch[j]);
            this.cache.set(cacheKey, embedding);
          }
        } catch (error) {
          logger.error(`Embedding batch error: ${error}`);
          throw error;
        }
      }
    }

    return results;
  }

  private getCacheKey(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex");
  }
}

export class CustomEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  private apiUrl: string;
  private apiKey: string;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingConfig, apiUrl: string, apiKey: string) {
    this.id = config.provider;
    this.model = config.model;
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async embedQuery(text: string): Promise<number[]> {
    const cacheKey = crypto.createHash("sha256").update(text).digest("hex");
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((item) => sanitizeAndNormalizeEmbedding(item.embedding));
  }
}

export function createEmbeddingProvider(
  config: EmbeddingConfig,
  aiConfig: { providers: Record<string, { api_url: string; api_key: string }> },
): EmbeddingProvider {
  const providerConfig = aiConfig.providers[config.provider];
  if (!providerConfig) {
    throw new Error(`Embedding provider not found in AI config: ${config.provider}`);
  }

  if (config.provider === "openai") {
    return new OpenAIEmbeddingProvider(
      config,
      providerConfig.api_url || undefined,
      providerConfig.api_key || undefined,
    );
  }

  return new CustomEmbeddingProvider(
    config,
    providerConfig.api_url,
    providerConfig.api_key,
  );
}

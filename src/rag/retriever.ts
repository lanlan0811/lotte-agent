import type { EmbeddingProvider, RAGSearchResult, RetrievalConfig } from "./types.js";
import { VectorStore } from "./store.js";
import { logger } from "../utils/logger.js";

export class Retriever {
  private store: VectorStore;
  private embeddingProvider: EmbeddingProvider;
  private config: RetrievalConfig;

  constructor(
    store: VectorStore,
    embeddingProvider: EmbeddingProvider,
    config: RetrievalConfig,
  ) {
    this.store = store;
    this.embeddingProvider = embeddingProvider;
    this.config = config;
  }

  async search(query: string, options?: { topK?: number; minScore?: number }): Promise<RAGSearchResult[]> {
    const topK = options?.topK ?? this.config.top_k;
    const minScore = options?.minScore ?? this.config.min_score;

    try {
      const queryEmbedding = await this.embeddingProvider.embedQuery(query);
      return this.store.searchByVector(queryEmbedding, topK, minScore);
    } catch (error) {
      logger.error(`RAG search error: ${error}`);
      throw error;
    }
  }

  formatResultsForContext(results: RAGSearchResult[]): string {
    if (results.length === 0) return "";

    const sections = results.map((result) => {
      const docName = result.document?.filename ?? "unknown";
      const score = result.score.toFixed(4);
      return `[Source: ${docName} | Relevance: ${score}]\n${result.chunk.text}`;
    });

    return `--- Retrieved Context ---\n${sections.join("\n\n")}\n--- End of Context ---`;
  }
}

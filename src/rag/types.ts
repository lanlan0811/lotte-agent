export interface EmbeddingProvider {
  id: string;
  model: string;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface RAGDocument {
  doc_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  chunk_count: number;
  created_at: number;
}

export interface RAGChunk {
  chunk_id: string;
  doc_id: string;
  text: string;
  embedding: number[];
  start_offset: number | null;
  end_offset: number | null;
  metadata_json: Record<string, unknown> | null;
}

export interface RAGSearchResult {
  chunk: RAGChunk;
  score: number;
  document?: RAGDocument;
}

export interface DocumentLoadResult {
  text: string;
  metadata: Record<string, unknown>;
}

export interface ChunkResult {
  chunks: Array<{
    text: string;
    start_offset: number;
    end_offset: number;
  }>;
}

export interface EmbeddingConfig {
  provider: string;
  model: string;
  dimension: number;
}

export interface ChunkConfig {
  size: number;
  overlap: number;
}

export interface RetrievalConfig {
  top_k: number;
  min_score: number;
}

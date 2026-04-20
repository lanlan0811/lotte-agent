import fs from "node:fs";
import path from "node:path";
import type { RAGConfig } from "../config/schema.js";
import type { AIConfig } from "../config/schema.js";
import type { RAGDocument, RAGChunk, RAGSearchResult } from "./types.js";
import { createEmbeddingProvider } from "./embedding.js";
import type { EmbeddingProvider } from "./types.js";
import { DocumentLoader } from "./loader.js";
import { DocumentChunker } from "./chunker.js";
import { VectorStore } from "./store.js";
import { Retriever } from "./retriever.js";
import { ensureDir } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import type { Database } from "../db/database.js";

export class RAGManager {
  private store: VectorStore;
  private loader: DocumentLoader;
  private chunker: DocumentChunker;
  private embeddingProvider: EmbeddingProvider;
  private retriever: Retriever;
  private ragDir: string;
  private initialized = false;

  constructor(config: RAGConfig, aiConfig: AIConfig, database: Database, dataDir: string) {
    this.ragDir = path.join(dataDir, "rag");
    this.store = new VectorStore(database.getDb());
    this.loader = new DocumentLoader();
    this.chunker = new DocumentChunker(config.chunk);

    this.embeddingProvider = createEmbeddingProvider(config.embedding, { providers: aiConfig.providers });
    this.retriever = new Retriever(this.store, this.embeddingProvider, config.retrieval);
  }

  initialize(): void {
    ensureDir(this.ragDir);
    this.initialized = true;
    logger.info(`RAG manager initialized (dir: ${this.ragDir})`);
  }

  async uploadDocument(filePath: string): Promise<RAGDocument> {
    this.ensureInitialized();

    if (!this.loader.isSupported(filePath)) {
      throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
    }

    const loadResult = await this.loader.load(filePath);
    const mimeType = this.loader.getMimeType(filePath);
    const stat = fs.statSync(filePath);

    const docId = VectorStore.generateId();
    const storedPath = await this.storeFile(docId, filePath);

    const document: RAGDocument = {
      doc_id: docId,
      filename: path.basename(filePath),
      file_path: storedPath,
      file_size: stat.size,
      mime_type: mimeType,
      chunk_count: 0,
      created_at: Date.now(),
    };

    const { chunks: rawChunks } = this.chunker.chunk(loadResult.text);

    if (rawChunks.length === 0) {
      document.chunk_count = 0;
      this.store.insertDocument(document);
      logger.info(`Uploaded document with no chunks: ${document.filename}`);
      return document;
    }

    const texts = rawChunks.map((c) => c.text);
    const embeddings = await this.embeddingProvider.embedBatch(texts);

    const ragChunks: RAGChunk[] = rawChunks.map((chunk, i) => ({
      chunk_id: VectorStore.generateId(),
      doc_id: docId,
      text: chunk.text,
      embedding: embeddings[i] ?? [],
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      metadata_json: null,
    }));

    this.store.insertChunks(ragChunks);

    document.chunk_count = ragChunks.length;
    this.store.insertDocument(document);

    logger.info(
      `Uploaded document: ${document.filename} (${ragChunks.length} chunks)`,
    );
    return document;
  }

  async search(query: string, options?: { topK?: number; minScore?: number }): Promise<RAGSearchResult[]> {
    this.ensureInitialized();
    return this.retriever.search(query, options);
  }

  async searchAndFormat(query: string): Promise<string> {
    const results = await this.search(query);
    return this.retriever.formatResultsForContext(results);
  }

  deleteDocument(docId: string): boolean {
    this.ensureInitialized();

    const doc = this.store.getDocument(docId);
    if (!doc) return false;

    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        fs.unlinkSync(doc.file_path);
      } catch {
        logger.warn(`Failed to delete file: ${doc.file_path}`);
      }
    }

    const deleted = this.store.deleteDocument(docId);
    if (deleted) {
      logger.info(`Deleted document: ${doc.filename}`);
    }
    return deleted;
  }

  listDocuments(limit = 100, offset = 0): RAGDocument[] {
    this.ensureInitialized();
    return this.store.listDocuments(limit, offset);
  }

  getDocument(docId: string): RAGDocument | undefined {
    this.ensureInitialized();
    return this.store.getDocument(docId);
  }

  getDocumentCount(): number {
    return this.store.getDocumentCount();
  }

  getTotalChunkCount(): number {
    return this.store.getTotalChunkCount();
  }

  getRetriever(): Retriever {
    return this.retriever;
  }

  getStore(): VectorStore {
    return this.store;
  }

  private async storeFile(docId: string, sourcePath: string): Promise<string> {
    ensureDir(this.ragDir);

    const ext = path.extname(sourcePath);
    const destPath = path.join(this.ragDir, `${docId}${ext}`);

    fs.copyFileSync(sourcePath, destPath);
    return destPath;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("RAG manager not initialized. Call initialize() first.");
    }
  }
}

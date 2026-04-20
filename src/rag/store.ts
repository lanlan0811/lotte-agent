import crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { RAGDocument, RAGChunk, RAGSearchResult } from "./types.js";

export class VectorStore {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  insertDocument(doc: RAGDocument): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rag_documents (doc_id, filename, file_path, file_size, mime_type, chunk_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        doc.doc_id,
        doc.filename,
        doc.file_path,
        doc.file_size,
        doc.mime_type,
        doc.chunk_count,
        doc.created_at,
      );
  }

  insertChunk(chunk: RAGChunk): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rag_chunks (chunk_id, doc_id, text, embedding, start_offset, end_offset, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        chunk.chunk_id,
        chunk.doc_id,
        chunk.text,
        JSON.stringify(chunk.embedding),
        chunk.start_offset,
        chunk.end_offset,
        chunk.metadata_json ? JSON.stringify(chunk.metadata_json) : null,
      );
  }

  insertChunks(chunks: RAGChunk[]): void {
    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        this.insertChunk(chunk);
      }
    });
    transaction();
  }

  getDocument(docId: string): RAGDocument | undefined {
    const row = this.db
      .prepare("SELECT * FROM rag_documents WHERE doc_id = ?")
      .get(docId) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return this.rowToDocument(row);
  }

  listDocuments(limit = 100, offset = 0): RAGDocument[] {
    const rows = this.db
      .prepare("SELECT * FROM rag_documents ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Record<string, unknown>[];

    return rows.map((row) => this.rowToDocument(row));
  }

  deleteDocument(docId: string): boolean {
    const deleteChunks = this.db.prepare("DELETE FROM rag_chunks WHERE doc_id = ?");
    const deleteDoc = this.db.prepare("DELETE FROM rag_documents WHERE doc_id = ?");

    const transaction = this.db.transaction(() => {
      deleteChunks.run(docId);
      const result = deleteDoc.run(docId);
      return result.changes > 0;
    });

    return transaction();
  }

  getChunksByDocument(docId: string): RAGChunk[] {
    const rows = this.db
      .prepare("SELECT * FROM rag_chunks WHERE doc_id = ? ORDER BY start_offset ASC")
      .all(docId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToChunk(row));
  }

  getChunkCount(docId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM rag_chunks WHERE doc_id = ?")
      .get(docId) as { count: number } | undefined;

    return row?.count ?? 0;
  }

  updateDocumentChunkCount(docId: string, count: number): void {
    this.db
      .prepare("UPDATE rag_documents SET chunk_count = ? WHERE doc_id = ?")
      .run(count, docId);
  }

  searchByVector(
    queryEmbedding: number[],
    topK: number,
    minScore: number,
  ): RAGSearchResult[] {
    const rows = this.db
      .prepare("SELECT * FROM rag_chunks")
      .all() as Record<string, unknown>[];

    const scored: RAGSearchResult[] = [];

    for (const row of rows) {
      const chunk = this.rowToChunk(row);
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);

      if (score >= minScore) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, topK);

    for (const result of results) {
      result.document = this.getDocument(result.chunk.doc_id);
    }

    return results;
  }

  getDocumentCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM rag_documents")
      .get() as { count: number } | undefined;

    return row?.count ?? 0;
  }

  getTotalChunkCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM rag_chunks")
      .get() as { count: number } | undefined;

    return row?.count ?? 0;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i]!;
      const bVal = b[i]!;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator < 1e-10) return 0;

    return dotProduct / denominator;
  }

  private rowToDocument(row: Record<string, unknown>): RAGDocument {
    return {
      doc_id: row.doc_id as string,
      filename: row.filename as string,
      file_path: row.file_path as string,
      file_size: row.file_size as number,
      mime_type: row.mime_type as string | null,
      chunk_count: row.chunk_count as number,
      created_at: row.created_at as number,
    };
  }

  private rowToChunk(row: Record<string, unknown>): RAGChunk {
    let embedding: number[] = [];
    try {
      const embeddingStr = row.embedding as string;
      embedding = JSON.parse(embeddingStr);
    } catch {
      embedding = [];
    }

    let metadata: Record<string, unknown> | null = null;
    try {
      if (row.metadata_json) {
        metadata = JSON.parse(row.metadata_json as string);
      }
    } catch {
      metadata = null;
    }

    return {
      chunk_id: row.chunk_id as string,
      doc_id: row.doc_id as string,
      text: row.text as string,
      embedding,
      start_offset: row.start_offset as number | null,
      end_offset: row.end_offset as number | null,
      metadata_json: metadata,
    };
  }

  static generateId(): string {
    return `rag_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  }
}

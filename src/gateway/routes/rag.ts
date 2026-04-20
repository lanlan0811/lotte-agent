import fs from "node:fs";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export function registerRAGRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/rag/documents`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ragManager = deps.app.getRAGManager();
      if (!ragManager) {
        reply.status(503).send({
          ok: false,
          error: { code: "RAG_NOT_ENABLED", message: "RAG module is not enabled", details: null },
        });
        return;
      }

      const query = _request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit ?? "100", 10), 500);
      const offset = parseInt(query.offset ?? "0", 10);

      const documents = ragManager.listDocuments(limit, offset);
      const total = ragManager.getDocumentCount();

      reply.send({
        ok: true,
        data: { documents, total, limit, offset },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "RAG_LIST_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.post(`${prefix}/rag/documents`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ragManager = deps.app.getRAGManager();
      if (!ragManager) {
        reply.status(503).send({
          ok: false,
          error: { code: "RAG_NOT_ENABLED", message: "RAG module is not enabled", details: null },
        });
        return;
      }

      const body = request.body as { file_path?: string } | undefined;
      if (!body?.file_path) {
        reply.status(400).send({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "No file_path provided in body.", details: null },
        });
        return;
      }

      if (!fs.existsSync(body.file_path)) {
        reply.status(400).send({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: `File not found: ${body.file_path}`, details: null },
        });
        return;
      }

      const document = await ragManager.uploadDocument(body.file_path);
      reply.status(201).send({ ok: true, data: { document } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "RAG_UPLOAD_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.delete(`${prefix}/rag/documents/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const ragManager = deps.app.getRAGManager();
      if (!ragManager) {
        reply.status(503).send({
          ok: false,
          error: { code: "RAG_NOT_ENABLED", message: "RAG module is not enabled", details: null },
        });
        return;
      }

      const deleted = ragManager.deleteDocument(id);
      if (!deleted) {
        reply.status(404).send({
          ok: false,
          error: { code: "DOCUMENT_NOT_FOUND", message: `Document not found: ${id}`, details: null },
        });
        return;
      }

      reply.send({ ok: true, data: { id, deleted: true } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "RAG_DELETE_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.post(`${prefix}/rag/search`, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { query?: string; top_k?: number; min_score?: number } | undefined;

    try {
      const ragManager = deps.app.getRAGManager();
      if (!ragManager) {
        reply.status(503).send({
          ok: false,
          error: { code: "RAG_NOT_ENABLED", message: "RAG module is not enabled", details: null },
        });
        return;
      }

      if (!body?.query) {
        reply.status(400).send({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "query is required", details: null },
        });
        return;
      }

      const results = await ragManager.search(body.query, {
        topK: body.top_k,
        minScore: body.min_score,
      });

      const formatted = results.map((r) => ({
        chunk_id: r.chunk.chunk_id,
        doc_id: r.chunk.doc_id,
        text: r.chunk.text,
        score: r.score,
        filename: r.document?.filename ?? null,
        start_offset: r.chunk.start_offset,
        end_offset: r.chunk.end_offset,
      }));

      reply.send({
        ok: true,
        data: { results: formatted, total: formatted.length },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "RAG_SEARCH_ERROR", message: msg, details: null },
      });
    }
  });

  fastify.get(`${prefix}/rag/stats`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ragManager = deps.app.getRAGManager();
      if (!ragManager) {
        reply.status(503).send({
          ok: false,
          error: { code: "RAG_NOT_ENABLED", message: "RAG module is not enabled", details: null },
        });
        return;
      }

      reply.send({
        ok: true,
        data: {
          documentCount: ragManager.getDocumentCount(),
          chunkCount: ragManager.getTotalChunkCount(),
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "RAG_STATS_ERROR", message: msg, details: null },
      });
    }
  });
}

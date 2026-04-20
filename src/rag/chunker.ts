import type { ChunkConfig, ChunkResult } from "./types.js";

export class DocumentChunker {
  private chunkSize: number;
  private overlap: number;

  constructor(config: ChunkConfig) {
    this.chunkSize = config.size;
    this.overlap = config.overlap;
  }

  chunk(text: string): ChunkResult {
    if (!text || text.trim().length === 0) {
      return { chunks: [] };
    }

    const paragraphs = this.splitIntoParagraphs(text);
    const chunks = this.mergeParagraphsIntoChunks(paragraphs);

    return { chunks };
  }

  private splitIntoParagraphs(text: string): string[] {
    const lines = text.split("\n");
    const paragraphs: string[] = [];
    let currentParagraph = "";

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0) {
        if (currentParagraph.trim().length > 0) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        continue;
      }

      if (currentParagraph.length + trimmedLine.length + 1 > this.chunkSize && currentParagraph.trim().length > 0) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = trimmedLine;
      } else {
        currentParagraph = currentParagraph.length > 0
          ? `${currentParagraph}\n${trimmedLine}`
          : trimmedLine;
      }
    }

    if (currentParagraph.trim().length > 0) {
      paragraphs.push(currentParagraph.trim());
    }

    return paragraphs;
  }

  private mergeParagraphsIntoChunks(paragraphs: string[]): ChunkResult["chunks"] {
    if (paragraphs.length === 0) return [];

    const chunks: ChunkResult["chunks"] = [];
    let currentChunk = "";
    let chunkStartOffset = 0;
    let currentOffset = 0;

    for (const paragraph of paragraphs) {
      if (
        currentChunk.length > 0 &&
        currentChunk.length + paragraph.length + 1 > this.chunkSize
      ) {
        chunks.push({
          text: currentChunk,
          start_offset: chunkStartOffset,
          end_offset: currentOffset - 1,
        });

        if (this.overlap > 0 && currentChunk.length > this.overlap) {
          const overlapText = currentChunk.slice(-this.overlap);
          currentChunk = overlapText + "\n" + paragraph;
          chunkStartOffset = currentOffset - overlapText.length;
        } else {
          currentChunk = paragraph;
          chunkStartOffset = currentOffset;
        }
      } else {
        currentChunk = currentChunk.length > 0
          ? `${currentChunk}\n${paragraph}`
          : paragraph;
      }

      currentOffset += paragraph.length + 1;
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk,
        start_offset: chunkStartOffset,
        end_offset: currentOffset - 1,
      });
    }

    return chunks;
  }
}

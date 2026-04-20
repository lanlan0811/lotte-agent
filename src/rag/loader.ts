import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../utils/logger.js";
import type { DocumentLoadResult } from "./types.js";

export class DocumentLoader {
  private supportedExtensions: Set<string>;

  constructor() {
    this.supportedExtensions = new Set([".txt", ".md", ".pdf", ".json", ".csv"]);
  }

  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.has(ext);
  }

  getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".pdf": "application/pdf",
      ".json": "application/json",
      ".csv": "text/csv",
    };
    return mimeMap[ext] ?? "application/octet-stream";
  }

  async load(filePath: string): Promise<DocumentLoadResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);

    switch (ext) {
      case ".txt":
      case ".md":
        return this.loadText(filePath, stat.size);
      case ".json":
        return this.loadJson(filePath, stat.size);
      case ".csv":
        return this.loadCsv(filePath, stat.size);
      case ".pdf":
        return this.loadPdf(filePath, stat.size);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private loadText(filePath: string, fileSize: number): DocumentLoadResult {
    const content = fs.readFileSync(filePath, "utf-8");
    return {
      text: content,
      metadata: {
        filename: path.basename(filePath),
        size: fileSize,
        type: "text",
        hash: this.computeHash(content),
      },
    };
  }

  private loadJson(filePath: string, fileSize: number): DocumentLoadResult {
    const content = fs.readFileSync(filePath, "utf-8");
    try {
      const parsed = JSON.parse(content);
      const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      return {
        text,
        metadata: {
          filename: path.basename(filePath),
          size: fileSize,
          type: "json",
          hash: this.computeHash(content),
        },
      };
    } catch {
      return {
        text: content,
        metadata: {
          filename: path.basename(filePath),
          size: fileSize,
          type: "json",
          hash: this.computeHash(content),
        },
      };
    }
  }

  private loadCsv(filePath: string, fileSize: number): DocumentLoadResult {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length === 0) {
      return {
        text: content,
        metadata: {
          filename: path.basename(filePath),
          size: fileSize,
          type: "csv",
          hash: this.computeHash(content),
        },
      };
    }

    const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).filter((line) => line.trim());
    const formattedRows = rows.map((row) => {
      const values = row.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return headers
        .map((header, i) => `${header}: ${values[i] ?? ""}`)
        .join(", ");
    });

    return {
      text: formattedRows.join("\n"),
      metadata: {
        filename: path.basename(filePath),
        size: fileSize,
        type: "csv",
        hash: this.computeHash(content),
        rowCount: rows.length,
        columnCount: headers.length,
      },
    };
  }

  private async loadPdf(filePath: string, fileSize: number): Promise<DocumentLoadResult> {
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(fs.readFileSync(filePath));
      const doc = await pdfjsLib.getDocument({ data }).promise;
      const pages: string[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? (item as { str: string }).str : ""))
          .join(" ");
        pages.push(pageText);
      }

      const text = pages.join("\n\n");
      return {
        text,
        metadata: {
          filename: path.basename(filePath),
          size: fileSize,
          type: "pdf",
          hash: this.computeHash(text),
          pageCount: doc.numPages,
        },
      };
    } catch (error) {
      logger.warn(`PDF loading failed, falling back to raw read: ${error}`);
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        text: content,
        metadata: {
          filename: path.basename(filePath),
          size: fileSize,
          type: "pdf-raw",
          hash: this.computeHash(content),
        },
      };
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}

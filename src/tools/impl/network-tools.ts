import { z } from "zod";
import type { ToolDefinition } from "../tool-registry.js";
import { logger } from "../../utils/logger.js";
import { formatErrorMessage } from "../../errors/errors.js";

const DEFAULT_TIMEOUT = 30000;
const MAX_RESPONSE_SIZE = 1024 * 1024;

export const httpFetchSchema = z.object({
  url: z.string().describe("URL to fetch"),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]).optional().default("GET").describe("HTTP method"),
  headers: z.record(z.string(), z.string()).optional().describe("Request headers"),
  body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
  timeout: z.number().positive().optional().describe("Timeout in milliseconds"),
  followRedirects: z.boolean().optional().default(true).describe("Follow HTTP redirects"),
});

export const webSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of results"),
});

export type HttpFetchArgs = z.infer<typeof httpFetchSchema>;
export type WebSearchArgs = z.infer<typeof webSearchSchema>;

async function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string> | undefined,
  body: string | undefined,
  timeout: number,
  followRedirects: boolean,
): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Lotte-Agent/1.0",
      ...headers,
    };

    if (body && !fetchHeaders["Content-Type"]) {
      fetchHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body || undefined,
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody: string;
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json") || contentType.includes("text/")) {
      const text = await response.text();
      responseBody = text.length > MAX_RESPONSE_SIZE
        ? text.slice(0, MAX_RESPONSE_SIZE) + "\n... [truncated]"
        : text;
    } else {
      const buffer = await response.arrayBuffer();
      const sizeKB = Math.round(buffer.byteLength / 1024);
      responseBody = `[Binary content, ${sizeKB} KB]`;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const httpFetchTool: ToolDefinition = {
  name: "http_fetch",
  description:
    "Make HTTP requests. Supports GET, POST, PUT, DELETE, PATCH, and HEAD methods. Returns response status, headers, and body.",
  category: "web",
  parameters: httpFetchSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = httpFetchSchema.parse(args);
    const timeout = parsed.timeout ?? DEFAULT_TIMEOUT;

    logger.info(`HTTP ${parsed.method} ${parsed.url}`);

    try {
      const result = await makeRequest(
        parsed.url,
        parsed.method ?? "GET",
        parsed.headers,
        parsed.body,
        timeout,
        parsed.followRedirects ?? true,
      );

      const parts: string[] = [
        `Status: ${result.status} ${result.statusText}`,
        `URL: ${parsed.url}`,
      ];

      const importantHeaders = ["content-type", "content-length", "location"];
      for (const key of importantHeaders) {
        if (result.headers[key]) {
          parts.push(`${key}: ${result.headers[key]}`);
        }
      }

      if (result.body) {
        parts.push(`\n${result.body}`);
      }

      return parts.join("\n");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return `Error: Request timed out after ${timeout}ms`;
      }
      const msg = formatErrorMessage(error);
      return `Error fetching ${parsed.url}: ${msg}`;
    }
  },
};

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web using a search engine. Returns a list of results with titles, URLs, and descriptions.",
  category: "web",
  parameters: webSearchSchema,
  requiresApproval: false,
  dangerous: false,
  readOnly: true,
  async execute(args: Record<string, unknown>): Promise<string> {
    const parsed = webSearchSchema.parse(args);
    const maxResults = parsed.maxResults ?? 5;

    logger.info(`Web search: ${parsed.query}`);

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(parsed.query)}`;

      const result = await makeRequest(
        searchUrl,
        "GET",
        { "Accept-Language": "en-US,en;q=0.9" },
        undefined,
        DEFAULT_TIMEOUT,
        true,
      );

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

      let match: RegExpExecArray | null;
      const titles: Array<{ url: string; title: string }> = [];

      while ((match = resultRegex.exec(result.body)) !== null && titles.length < maxResults) {
        const url = match[1]?.replace(/&amp;/g, "&") ?? "";
        const title = match[2]?.replace(/<[^>]*>/g, "").trim() ?? "";
        titles.push({ url, title });
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(result.body)) !== null && snippets.length < maxResults) {
        const snippet = match[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
        snippets.push(snippet);
      }

      for (let i = 0; i < titles.length; i++) {
        results.push({
          title: titles[i]?.title ?? "",
          url: titles[i]?.url ?? "",
          snippet: snippets[i] ?? "",
        });
      }

      if (results.length === 0) {
        return `No results found for: ${parsed.query}`;
      }

      const lines = results.map((r, i) => {
        const parts = [`${i + 1}. ${r.title}`, `   ${r.url}`];
        if (r.snippet) {
          parts.push(`   ${r.snippet}`);
        }
        return parts.join("\n");
      });

      return `Search results for "${parsed.query}":\n\n${lines.join("\n\n")}`;
    } catch (error) {
      const msg = formatErrorMessage(error);
      return `Error searching for "${parsed.query}": ${msg}`;
    }
  },
};

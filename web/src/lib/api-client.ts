const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:10623";
const API_TIMEOUT = 30000;
const API_MAX_RETRIES = 2;
const API_RETRY_DELAY = 1000;

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_BASE;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit, retryCount = 0): Promise<ApiResponse<T>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      };

      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if ((response.status === 502 || response.status === 503) && retryCount < API_MAX_RETRIES) {
          await this.delay(API_RETRY_DELAY * (retryCount + 1));
          return this.request<T>(path, options, retryCount + 1);
        }

        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody?.error?.message) {
            errorMessage = errorBody.error.message;
          }
        } catch {}

        return {
          ok: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorMessage,
          },
        };
      }

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          ok: false,
          error: {
            code: "TIMEOUT",
            message: "Request timed out. The server may be busy or unreachable.",
          },
        };
      }

      if (retryCount < API_MAX_RETRIES && !(error instanceof TypeError)) {
        await this.delay(API_RETRY_DELAY * (retryCount + 1));
        return this.request<T>(path, options, retryCount + 1);
      }

      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network request failed",
        },
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "DELETE" });
  }

  async health(): Promise<ApiResponse<{ status: string; version: string; uptime: number }>> {
    return this.get("/health");
  }
}

export const apiClient = new ApiClient();

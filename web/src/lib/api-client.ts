import { APP_CONFIG } from "./config";

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
    this.baseUrl = baseUrl || APP_CONFIG.API_BASE;
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
      const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.API_TIMEOUT);

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
        if ((response.status === 502 || response.status === 503) && retryCount < APP_CONFIG.API_MAX_RETRIES) {
          await this.delay(APP_CONFIG.API_RETRY_DELAY * (retryCount + 1));
          return this.request<T>(path, options, retryCount + 1);
        }

        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody?.error?.message) {
            errorMessage = errorBody.error.message;
          }
        } catch {
          console.debug("[api-client] Failed to parse error response body");
        }

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

      if (retryCount < APP_CONFIG.API_MAX_RETRIES && !(error instanceof TypeError)) {
        await this.delay(APP_CONFIG.API_RETRY_DELAY * (retryCount + 1));
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

  async get<T>(path: string, params?: Record<string, string | number>): Promise<ApiResponse<T>> {
    let url = path;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url = `${path}?${qs}`;
    }
    return this.request<T>(url, { method: "GET" });
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

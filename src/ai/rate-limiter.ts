export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrentRequests: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RATE_LIMIT: RateLimiterConfig = {
  maxRequestsPerMinute: 60,
  maxTokensPerMinute: 150000,
  maxConcurrentRequests: 5,
};

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

export class SlidingWindowRateLimiter {
  private requests: RequestRecord[] = [];
  private activeCount = 0;
  private readonly config: RateLimiterConfig;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  async acquire(estimatedTokens: number): Promise<void> {
    while (true) {
      this.pruneWindow();

      const requestCount = this.requests.length;
      const tokenSum = this.requests.reduce((sum, r) => sum + r.tokens, 0);

      if (
        requestCount < this.config.maxRequestsPerMinute &&
        tokenSum + estimatedTokens <= this.config.maxTokensPerMinute &&
        this.activeCount < this.config.maxConcurrentRequests
      ) {
        this.requests.push({ timestamp: Date.now(), tokens: estimatedTokens });
        this.activeCount++;
        return;
      }

      await this.sleep(200);
    }
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  private pruneWindow(): void {
    const cutoff = Date.now() - 60000;
    this.requests = this.requests.filter((r) => r.timestamp > cutoff);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class RetryHandler {
  private readonly config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY, ...config };
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    onError?: (error: unknown, attempt: number, delay: number) => void,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt >= this.config.maxRetries) {
          break;
        }

        if (!this.isRetryable(error)) {
          break;
        }

        const delay = this.calculateDelay(attempt);

        if (onError) {
          onError(error, attempt + 1, delay);
        }

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status;
      return this.config.retryableStatusCodes.includes(status);
    }

    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code: string }).code;
      const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"];
      return retryableCodes.includes(code);
    }

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("overloaded")) {
        return true;
      }
      if (msg.includes("timeout") || msg.includes("network") || msg.includes("connection")) {
        return true;
      }
    }

    return false;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const jitter = Math.random() * this.config.baseDelayMs;
    const delay = exponentialDelay + jitter;
    return Math.min(delay, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class ProviderRateLimiterRegistry {
  private limiters: Map<string, SlidingWindowRateLimiter> = new Map();
  private retryHandlers: Map<string, RetryHandler> = new Map();

  registerProvider(
    providerId: string,
    rateLimitConfig?: Partial<RateLimiterConfig>,
    retryConfig?: Partial<RetryConfig>,
  ): void {
    this.limiters.set(providerId, new SlidingWindowRateLimiter(rateLimitConfig));
    this.retryHandlers.set(providerId, new RetryHandler(retryConfig));
  }

  getLimiter(providerId: string): SlidingWindowRateLimiter | undefined {
    return this.limiters.get(providerId);
  }

  getRetryHandler(providerId: string): RetryHandler | undefined {
    return this.retryHandlers.get(providerId);
  }

  unregisterProvider(providerId: string): void {
    this.limiters.delete(providerId);
    this.retryHandlers.delete(providerId);
  }
}

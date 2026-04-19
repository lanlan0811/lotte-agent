import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  retryableError?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  let currentDelay = opts.delayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (opts.retryableError && !opts.retryableError(error)) {
        throw error;
      }

      if (attempt < opts.maxAttempts) {
        logger.debug(
          `Retry attempt ${attempt}/${opts.maxAttempts} after ${currentDelay}ms`,
        );
        await sleep(currentDelay);
        currentDelay = Math.min(currentDelay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ExponentialBackoff {
  private attempt = 0;
  private readonly baseDelayMs: number;
  private readonly multiplier: number;
  private readonly maxDelayMs: number;
  private readonly jitter: boolean;

  constructor(options: {
    baseDelayMs?: number;
    multiplier?: number;
    maxDelayMs?: number;
    jitter?: boolean;
  } = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.multiplier = options.multiplier ?? 2;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.jitter = options.jitter ?? true;
  }

  next(): number {
    this.attempt++;
    let delay = this.baseDelayMs * Math.pow(this.multiplier, this.attempt - 1);
    delay = Math.min(delay, this.maxDelayMs);

    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  reset(): void {
    this.attempt = 0;
  }

  getAttempt(): number {
    return this.attempt;
  }
}

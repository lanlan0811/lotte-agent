export type ErrorCode =
  | "AUTH_TOKEN_MISSING"
  | "AUTH_TOKEN_INVALID"
  | "AUTH_PASSWORD_MISMATCH"
  | "SESSION_NOT_FOUND"
  | "TOOL_NOT_FOUND"
  | "TOOL_EXECUTION_ERROR"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "CONFIG_VALIDATION_ERROR"
  | "MODEL_API_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "CHANNEL_ERROR"
  | "MCP_CONNECTION_ERROR"
  | "SKILL_NOT_FOUND"
  | "MEMORY_ERROR"
  | "RAG_ERROR"
  | "DATABASE_ERROR";

const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_PASSWORD_MISMATCH: 401,
  SESSION_NOT_FOUND: 404,
  TOOL_NOT_FOUND: 404,
  TOOL_EXECUTION_ERROR: 500,
  APPROVAL_REQUIRED: 202,
  APPROVAL_REJECTED: 403,
  CONFIG_VALIDATION_ERROR: 400,
  MODEL_API_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  CHANNEL_ERROR: 500,
  MCP_CONNECTION_ERROR: 502,
  SKILL_NOT_FOUND: 404,
  MEMORY_ERROR: 500,
  RAG_ERROR: 500,
  DATABASE_ERROR: 500,
};

export interface LotteErrorDetail {
  code: ErrorCode;
  message: string;
  details: unknown;
  retryable: boolean;
  retryAfterMs: number | null;
}

export interface LotteErrorResponse {
  ok: false;
  error: LotteErrorDetail;
}

export interface LotteSuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export type LotteResponse<T = unknown> = LotteSuccessResponse<T> | LotteErrorResponse;

export class LotteError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly httpStatus: number;

  constructor(options: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number | null;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "LotteError";
    this.code = options.code;
    this.details = options.details ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.httpStatus = ERROR_HTTP_STATUS[options.code] ?? 500;
  }

  toResponse(): LotteErrorResponse {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        retryable: this.retryable,
        retryAfterMs: this.retryAfterMs,
      },
    };
  }

  static fromResponse(response: LotteErrorResponse): LotteError {
    return new LotteError({
      code: response.error.code,
      message: response.error.message,
      details: response.error.details,
      retryable: response.error.retryable,
      retryAfterMs: response.error.retryAfterMs,
    });
  }
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  options: {
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number | null;
  } = {},
): LotteErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details: options.details ?? null,
      retryable: options.retryable ?? false,
      retryAfterMs: options.retryAfterMs ?? null,
    },
  };
}

export function createSuccessResponse<T>(data: T): LotteSuccessResponse<T> {
  return {
    ok: true,
    data,
  };
}

export function getHttpStatusForError(code: ErrorCode): number {
  return ERROR_HTTP_STATUS[code] ?? 500;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  return undefined;
}

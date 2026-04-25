export const DEFAULT_AGENT_MAX_CONCURRENT = 4;
export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 8;

export interface AgentConcurrencyConfig {
  maxConcurrent: number;
  maxConcurrentPerSession: number;
  subagentMaxConcurrent: number;
  queueTimeout: number;
}

export const DEFAULT_AGENT_CONCURRENCY: AgentConcurrencyConfig = {
  maxConcurrent: DEFAULT_AGENT_MAX_CONCURRENT,
  maxConcurrentPerSession: 1,
  subagentMaxConcurrent: DEFAULT_SUBAGENT_MAX_CONCURRENT,
  queueTimeout: 300_000,
};

export function resolveAgentConcurrencyConfig(
  partial?: Partial<AgentConcurrencyConfig>,
): AgentConcurrencyConfig {
  return {
    maxConcurrent: resolvePositiveInt(
      partial?.maxConcurrent,
      DEFAULT_AGENT_CONCURRENCY.maxConcurrent,
    ),
    maxConcurrentPerSession: resolvePositiveInt(
      partial?.maxConcurrentPerSession,
      DEFAULT_AGENT_CONCURRENCY.maxConcurrentPerSession,
    ),
    subagentMaxConcurrent: resolvePositiveInt(
      partial?.subagentMaxConcurrent,
      DEFAULT_AGENT_CONCURRENCY.subagentMaxConcurrent,
    ),
    queueTimeout: resolvePositiveInt(
      partial?.queueTimeout,
      DEFAULT_AGENT_CONCURRENCY.queueTimeout,
    ),
  };
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return fallback;
}

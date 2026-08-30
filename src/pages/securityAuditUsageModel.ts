import type { SecurityAuditUsageBucket, SecurityAuditUsageSummary } from '@/services/api/securityAudit';

export interface AuditUsageTrend {
  labels: string[];
  calls: number[];
  failedCalls: number[];
  inputTokens: number[];
}

/**
 * buildAuditUsageTrend keeps the daily buckets in the order returned by the
 * backend, which already sorts them ascending by day.
 */
export function buildAuditUsageTrend(buckets: SecurityAuditUsageBucket[]): AuditUsageTrend {
  return {
    labels: buckets.map((bucket) => bucket.key),
    calls: buckets.map((bucket) => bucket.calls),
    failedCalls: buckets.map((bucket) => bucket.failed_calls),
    inputTokens: buckets.map((bucket) => bucket.input_tokens),
  };
}

/** formatAuditSuccessRate renders the share of successful audit model calls. */
export function formatAuditSuccessRate(bucket: SecurityAuditUsageBucket): string {
  if (bucket.calls <= 0) return '-';
  return `${((bucket.success_calls / bucket.calls) * 100).toFixed(1)}%`;
}

/** hasAuditCost is false when no price is configured, so no cost column is shown. */
export function hasAuditCost(summary: SecurityAuditUsageSummary): boolean {
  return summary.price_per_million_input_tokens > 0;
}

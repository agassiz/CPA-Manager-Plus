import { describe, expect, it } from 'vitest';
import type {
  SecurityAuditUsageBucket,
  SecurityAuditUsageSummary,
} from '@/services/api/securityAudit';
import {
  buildAuditUsageTrend,
  formatAuditSuccessRate,
  hasAuditCost,
} from './securityAuditUsageModel';

const bucket = (overrides: Partial<SecurityAuditUsageBucket>): SecurityAuditUsageBucket => ({
  key: 'total',
  calls: 0,
  success_calls: 0,
  failed_calls: 0,
  input_tokens: 0,
  input_chars: 0,
  avg_latency_ms: 0,
  p95_latency_ms: 0,
  estimated_cost: 0,
  ...overrides,
});

const summary = (overrides: Partial<SecurityAuditUsageSummary>): SecurityAuditUsageSummary => ({
  group_by: 'day',
  from_ms: 0,
  to_ms: 0,
  total: bucket({}),
  buckets: [],
  price_per_million_input_tokens: 0,
  ...overrides,
});

describe('securityAuditUsageModel', () => {
  it('builds daily series in backend order', () => {
    const trend = buildAuditUsageTrend([
      bucket({ key: '2026-08-30', calls: 4, failed_calls: 1, input_tokens: 40 }),
      bucket({ key: '2026-08-31', calls: 2, failed_calls: 0, input_tokens: 15 }),
    ]);

    expect(trend).toEqual({
      labels: ['2026-08-30', '2026-08-31'],
      calls: [4, 2],
      failedCalls: [1, 0],
      inputTokens: [40, 15],
    });
  });

  it('formats success rate and marks empty buckets', () => {
    expect(formatAuditSuccessRate(bucket({ calls: 4, success_calls: 3 }))).toBe('75.0%');
    expect(formatAuditSuccessRate(bucket({}))).toBe('-');
  });

  it('hides the cost column when no price is configured', () => {
    expect(hasAuditCost(summary({ price_per_million_input_tokens: 0 }))).toBe(false);
    expect(hasAuditCost(summary({ price_per_million_input_tokens: 2 }))).toBe(true);
  });
});

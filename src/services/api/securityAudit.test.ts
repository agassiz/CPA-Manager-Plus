import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./client', () => ({
  apiClient: mocks,
}));

import { securityAuditApi } from './securityAudit';

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe('securityAuditApi response normalization', () => {
  it('defaults omitted configuration arrays for installations without security-audit YAML', async () => {
    mocks.get.mockResolvedValue({
      enabled: false,
      'blocking-enabled': false,
      'store-pass-events': false,
      'max-events': 500,
      guard: {
        enabled: false,
        'base-url': '',
        model: 'qwen3guard:0.6b',
        'timeout-ms': 5000,
        'input-limit': 12000,
      },
    });

    await expect(securityAuditApi.getConfig()).resolves.toMatchObject({
      'blocking-latest-turn-only': false,
      rules: [],
      guard: { 'max-concurrency': 2, 'max-waiting': 64, scanners: [] },
    });
  });

  it('defaults nullable event arrays returned by existing SQLite rows', async () => {
    mocks.get.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 1,
          created_at: '2026-08-05T00:00:00Z',
          endpoint: '/v1/responses',
          protocol: 'openai_responses',
          mode: 'async_audit',
          source: 'regex',
          decision: 'pass',
          risk_level: 'low',
          matched_rules: null,
          categories: null,
          matched_scanners: null,
          prompt_hash: 'hash',
          prompt_preview: 'hello',
          prompt_length: 5,
          latency_ms: 0,
        },
      ],
    });

    const response = await securityAuditApi.getEvents();
    expect(response.items[0]).toMatchObject({
      chunk_total: 0,
      matched_rules: [],
      categories: [],
      matched_scanners: [],
    });
  });
});

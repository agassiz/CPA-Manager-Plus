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
      moderations: {
        enabled: false,
        'base-url': '',
        model: '',
        'timeout-ms': 0,
        'input-limit': 0,
        'max-concurrency': 0,
        'max-waiting': 0,
        categories: null,
        thresholds: null,
        'usage-price-per-million-input-tokens': 0,
      },
    });

    await expect(securityAuditApi.getConfig()).resolves.toMatchObject({
      'audit-third-party': false,
      'blocking-latest-turn-only': false,
      rules: [],
      engine: 'qwen3guard',
      guard: { 'max-concurrency': 2, 'max-waiting': 64, scanners: [] },
      moderations: { categories: [], thresholds: {} },
    });
  });

  it('preserves the explicit third-party audit policy', async () => {
    mocks.get.mockResolvedValue({
      enabled: true,
      'audit-third-party': true,
      'blocking-enabled': false,
      'blocking-latest-turn-only': false,
      'store-pass-events': false,
      'max-events': 500,
      guard: {
        enabled: false,
        'base-url': '',
        model: 'qwen3guard:0.6b',
        'timeout-ms': 5000,
        'input-limit': 12000,
        'max-concurrency': 2,
        'max-waiting': 64,
        scanners: [],
      },
      moderations: {
        enabled: false,
        'base-url': '',
        model: '',
        'timeout-ms': 0,
        'input-limit': 0,
        'max-concurrency': 0,
        'max-waiting': 0,
        categories: [],
        thresholds: {},
        'usage-price-per-million-input-tokens': 0,
      },
    });

    await expect(securityAuditApi.getConfig()).resolves.toMatchObject({
      'audit-third-party': true,
    });
  });

  it('keeps the configured engine and moderations policy returned by the backend', async () => {
    mocks.get.mockResolvedValue({
      enabled: true,
      'blocking-enabled': true,
      'store-pass-events': false,
      'max-events': 500,
      engine: 'openai_moderations',
      rules: [],
      guard: {
        enabled: false,
        'base-url': '',
        model: 'qwen3guard:0.6b',
        'timeout-ms': 5000,
        'input-limit': 12000,
        'max-concurrency': 2,
        'max-waiting': 64,
        scanners: [],
      },
      moderations: {
        enabled: true,
        'base-url': 'https://api.openai.com',
        model: 'omni-moderation-latest',
        'timeout-ms': 5000,
        'input-limit': 12000,
        'max-concurrency': 8,
        'max-waiting': 64,
        categories: ['hate'],
        thresholds: { hate: 0.65 },
        'usage-price-per-million-input-tokens': 0,
      },
    });

    await expect(securityAuditApi.getConfig()).resolves.toMatchObject({
      engine: 'openai_moderations',
      moderations: { categories: ['hate'], thresholds: { hate: 0.65 } },
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
          highest_score: 0,
          category_scores: null,
        },
      ],
    });

    const response = await securityAuditApi.getEvents();
    expect(response.items[0]).toMatchObject({
      chunk_total: 0,
      matched_rules: [],
      categories: [],
      matched_scanners: [],
      category_scores: {},
    });
  });

  it('sends the selected engine and both configuration blocks when probing', async () => {
    mocks.post.mockResolvedValue({ ok: true, 'latency-ms': 12 });
    const guard = {
      enabled: false,
      'base-url': 'http://127.0.0.1:11434',
      model: 'qwen3guard:0.6b',
      'timeout-ms': 5000,
      'input-limit': 12000,
      'max-concurrency': 2,
      'max-waiting': 64,
      scanners: [],
    };
    const moderations = {
      enabled: true,
      'base-url': 'https://api.openai.com',
      model: 'omni-moderation-latest',
      'timeout-ms': 5000,
      'input-limit': 12000,
      'max-concurrency': 8,
      'max-waiting': 64,
      categories: ['hate'],
      thresholds: { hate: 0.65 },
      'usage-price-per-million-input-tokens': 0,
    };

    await securityAuditApi.probe('openai_moderations', guard, moderations);

    expect(mocks.post).toHaveBeenCalledWith('/security-audit/probe', {
      engine: 'openai_moderations',
      guard,
      moderations,
    });
  });

  it('defaults omitted usage buckets to an array', async () => {
    mocks.get.mockResolvedValue({
      group_by: 'day',
      from_ms: 0,
      to_ms: 0,
      total: {
        key: 'total',
        calls: 0,
        success_calls: 0,
        failed_calls: 0,
        input_tokens: 0,
        input_chars: 0,
        avg_latency_ms: 0,
        p95_latency_ms: 0,
        estimated_cost: 0,
      },
      buckets: null,
      price_per_million_input_tokens: 0,
    });

    await expect(securityAuditApi.getUsage('day')).resolves.toMatchObject({ buckets: [] });
    expect(mocks.get).toHaveBeenCalledWith('/security-audit/usage', {
      params: { 'group-by': 'day' },
    });
  });
});

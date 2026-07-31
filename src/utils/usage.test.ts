import { describe, expect, it } from 'vitest';

import {
  buildCandidateUsageSourceIds,
  calculateCacheHitRate,
  calculateCost,
  collectUsageDetails,
  collectUsageDetailsWithEndpoint,
  compatibleCachedTokens,
  extractTotalTokens,
  formatCompactNumber,
  getServiceTierMultiplier,
  normalizeModelPrices,
  normalizeUsageSourceId,
} from './usage';
import { maskSensitiveText } from './format';

describe('calculateCacheHitRate', () => {
  it('uses uncached input, cache reads, and cache writes without double-counting aliases', () => {
    expect(
      calculateCacheHitRate({
        inputTokens: 5_360_000,
        cachedTokens: 147_390_000,
        cacheReadTokens: 147_390_000,
        cacheCreationTokens: 2_000_000,
      })
    ).toBeCloseTo(147_390_000 / (5_360_000 + 147_390_000 + 2_000_000));
  });
});

describe('formatCompactNumber', () => {
  it('keeps large values compact as data grows beyond millions', () => {
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(1_200)).toBe('1.2K');
    expect(formatCompactNumber(999_950)).toBe('1.0M');
    expect(formatCompactNumber(2_795_200_000)).toBe('2.8B');
    expect(formatCompactNumber(1_200_000_000_000)).toBe('1.2T');
    expect(formatCompactNumber(-2_500_000_000_000_000)).toBe('-2.5P');
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('normalizeModelPrices', () => {
  it('defaults missing cache prices without overwriting explicit zeroes', () => {
    const prices = normalizeModelPrices({
      'missing-cache-fields': {
        prompt: 2.5,
        completion: 15,
        cache: 0.25,
      },
      'explicit-zero-cache-write': {
        prompt: 1,
        completion: 2,
        cache: 0.1,
        cacheRead: 0,
        cacheCreation: 0,
      },
    });

    expect(prices['missing-cache-fields']).toMatchObject({
      cacheRead: 0.25,
      cacheCreation: 2.5,
    });
    expect(prices['explicit-zero-cache-write']).toMatchObject({
      cacheRead: 0,
      cacheCreation: 0,
    });
  });
});

describe('usage source candidates', () => {
  it('includes the masked source emitted by CPA for raw upstream keys', () => {
    expect(buildCandidateUsageSourceIds({ apiKey: 'sk-1234567890abcdef' })).toContain(
      'm:sk-1...cdef'
    );
  });

  it('aligns short secret masking with the backend source contract', () => {
    expect(buildCandidateUsageSourceIds({ apiKey: 'sk-12345' })).toContain('m:****');
  });

  it('preserves already-normalized masked usage event sources', () => {
    const usageData = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5.5': {
              details: [
                {
                  timestamp: '2026-05-26T10:00:00Z',
                  source: 'm:sk-1...cdef',
                  auth_index: '',
                  tokens: {},
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].source).toBe('m:sk-1...cdef');
  });

  it('does not trust text-prefixed raw API key sources', () => {
    const sourceId = buildCandidateUsageSourceIds({ prefix: 'codex' })[0];
    expect(sourceId).toBe('t:codex');

    const usageData = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5.5': {
              details: [
                {
                  timestamp: '2026-05-26T10:00:00Z',
                  source: 't:sk-1234567890abcdef',
                  auth_index: '',
                  tokens: {},
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    const normalized = collectUsageDetails(usageData)[0].source;
    expect(normalized).toMatch(/^k:/);
    expect(normalized).not.toContain('sk-1234567890abcdef');
  });

  it('does not trust abnormal masked sources that contain raw secrets', () => {
    const normalized = normalizeUsageSourceId('m:sk-realsecret');

    expect(normalized).toMatch(/^k:/);
    expect(normalized).not.toContain('sk-realsecret');
  });

  it('preserves legacy UI-masked source IDs when no raw secret is present', () => {
    expect(normalizeUsageSourceId('m:sk******ef')).toBe('m:sk******ef');
  });
});

describe('usage detail collection', () => {
  it('copies project id snapshots into normalized usage details', () => {
    const usageData = {
      apis: {
        'POST /v1/chat/completions': {
          models: {
            'gemini-2.5-pro': {
              details: [
                {
                  timestamp: '2026-05-09T01:12:43.000Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  auth_project_id_snapshot: 'vertex-project-42',
                  tokens: {
                    input_tokens: 10,
                    output_tokens: 5,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].auth_project_id_snapshot).toBe('vertex-project-42');
    expect(collectUsageDetailsWithEndpoint(usageData)[0].auth_project_id_snapshot).toBe(
      'vertex-project-42'
    );
  });

  it('accepts camelCase project id snapshots from usage details', () => {
    const usageData = {
      apis: {
        'POST /v1/chat/completions': {
          models: {
            'gemini-2.5-pro': {
              details: [
                {
                  timestamp: '2026-05-09T01:12:43.000Z',
                  source: 'alice@example.com',
                  authIndex: 'auth-1',
                  authProjectIdSnapshot: 'camel-project-42',
                  tokens: {},
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].auth_project_id_snapshot).toBe('camel-project-42');
    expect(collectUsageDetailsWithEndpoint(usageData)[0].auth_project_id_snapshot).toBe(
      'camel-project-42'
    );
  });

  it('extracts resolved_model alongside the requested model name', () => {
    const usageData = {
      apis: {
        'POST /v1/chat/completions': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  resolved_model: 'gpt-5.5',
                  tokens: { input_tokens: 1 },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    const detail = collectUsageDetails(usageData)[0];
    expect(detail.__modelName).toBe('gpt-5.4');
    expect(detail.__resolvedModel).toBe('gpt-5.5');
    expect(collectUsageDetailsWithEndpoint(usageData)[0].__resolvedModel).toBe('gpt-5.5');
  });

  it('extracts usage details from management API wrapped payloads', () => {
    const usageData = {
      usage: {
        apis: {
          'POST /v1/chat/completions': {
            models: {
              'gpt-5.4': {
                details: [
                  {
                    timestamp: '2026-05-19T10:00:00Z',
                    source: 'alice@example.com',
                    auth_index: 'auth-1',
                    tokens: { input_tokens: 1 },
                    failed: false,
                  },
                ],
              },
            },
          },
        },
      },
      failed_requests: 0,
    };

    const detail = collectUsageDetailsWithEndpoint(usageData)[0];
    expect(detail.__modelName).toBe('gpt-5.4');
    expect(detail.__endpoint).toBe('POST /v1/chat/completions');
  });

  it('copies TTFT metadata into normalized usage details', () => {
    const usageData = {
      apis: {
        'POST /v1/chat/completions': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  latency_ms: 1500,
                  ttft_ms: 450,
                  tokens: { output_tokens: 20 },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].ttft_ms).toBe(450);
    expect(collectUsageDetailsWithEndpoint(usageData)[0].ttft_ms).toBe(450);
  });

  it('normalizes native CPA error status and message fields', () => {
    const usageData = {
      apis: {
        'POST /v1/chat/completions': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  latency_ms: 1500,
                  tokens: { output_tokens: 0 },
                  failed: true,
                  error_status: 429,
                  error_message: 'quota exceeded',
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].fail_status_code).toBe(429);
    expect(collectUsageDetails(usageData)[0].fail_summary).toBe('quota exceeded');
    expect(collectUsageDetailsWithEndpoint(usageData)[0].fail_status_code).toBe(429);
    expect(collectUsageDetailsWithEndpoint(usageData)[0].fail_summary).toBe('quota exceeded');
  });

  it('extracts reasoning effort from native CPA thinking metadata', () => {
    const usageData = {
      apis: {
        'POST /v1/messages': {
          models: {
            'claude-opus-4-6-thinking': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  thinking: {
                    mode: 'budget',
                    level: 'high',
                    budget: 24576,
                  },
                  tokens: { output_tokens: 10 },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetails(usageData)[0].reasoning_effort).toBe('high');
    expect(collectUsageDetailsWithEndpoint(usageData)[0].reasoning_effort).toBe('high');
  });

  it('uses thinking intensity when native CPA emits intensity metadata', () => {
    const usageData = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  thinking: {
                    intensity: 'medium',
                  },
                  tokens: { output_tokens: 10 },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    expect(collectUsageDetailsWithEndpoint(usageData)[0].reasoning_effort).toBe('medium');
  });

  it('normalizes CPA mirrored cached tokens without double counting fine-grained cache', () => {
    const usageData = {
      apis: {
        'POST /v1/messages': {
          models: {
            'claude-sonnet': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  tokens: {
                    input_tokens: 100,
                    output_tokens: 20,
                    cached_tokens: 500,
                    cache_read_tokens: 500,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    const detail = collectUsageDetailsWithEndpoint(usageData)[0];

    expect(detail.tokens.cached_tokens).toBe(0);
    expect(detail.tokens.cache_read_tokens).toBe(500);
  });

  it('normalizes Anthropic cache input token fields', () => {
    const usageData = {
      apis: {
        'POST /v1/messages': {
          models: {
            'claude-sonnet': {
              details: [
                {
                  timestamp: '2026-05-19T10:00:00Z',
                  source: 'alice@example.com',
                  auth_index: 'auth-1',
                  tokens: {
                    input_tokens: 100,
                    output_tokens: 20,
                    cached_tokens: 34,
                    cache_creation_input_tokens: 11,
                    cache_read_input_tokens: 23,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    };

    const detail = collectUsageDetailsWithEndpoint(usageData)[0];

    expect(detail.tokens.cached_tokens).toBe(0);
    expect(detail.tokens.cache_creation_tokens).toBe(11);
    expect(detail.tokens.cache_read_tokens).toBe(23);
    expect(detail.tokens.total_tokens).toBe(154);
  });
});

describe('usage token helpers', () => {
  it('keeps legacy cached tokens separate from fine-grained cache buckets', () => {
    expect(compatibleCachedTokens(5, 0, 4, 1)).toBe(0);
    expect(compatibleCachedTokens(10, 0, 4, 1)).toBe(5);
    expect(compatibleCachedTokens(0, 8, 3, 0)).toBe(5);
  });

  it('uses fine-grained cache fields when total tokens are missing', () => {
    expect(
      extractTotalTokens({
        tokens: {
          input_tokens: 10,
          output_tokens: 20,
          reasoning_tokens: 3,
          cached_tokens: 10,
          cache_read_tokens: 4,
          cache_creation_tokens: 1,
        },
      })
    ).toBe(43);
  });

  it('uses Anthropic cache input fields when total tokens are missing', () => {
    expect(
      extractTotalTokens({
        tokens: {
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 34,
          cache_read_input_tokens: 23,
          cache_creation_input_tokens: 11,
        },
      })
    ).toBe(154);
  });
});

describe('sensitive text masking', () => {
  it('does not redact ordinary AI-prefixed diagnostics or swallow JSON after cookie fields', () => {
    const text = `AImproved fallback AIServer down {"cookie":"session=secret","status":"401","detail":"upstream denied","retry_after":30}`;
    const masked = maskSensitiveText(text);

    expect(masked).toContain('AImproved fallback');
    expect(masked).toContain('AIServer down');
    expect(masked).toContain('"status":"401"');
    expect(masked).toContain('"detail":"upstream denied"');
    expect(masked).toContain('"retry_after":30');
    expect(masked).not.toContain('session=secret');
  });
});

describe('calculateCost model price preference', () => {
  const prices = {
    'gpt-5.5': { prompt: 5, completion: 10, cache: 1 },
    'gpt-5.4': { prompt: 50, completion: 100, cache: 10 },
  };

  it('prefers resolved upstream model when present', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000, output_tokens: 0 },
        __modelName: 'gpt-5.4',
        __resolvedModel: 'gpt-5.5',
      },
      prices
    );
    expect(cost).toBeCloseTo(5);
  });

  it('falls back to requested alias when resolved is absent', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000, output_tokens: 0 },
        __modelName: 'gpt-5.4',
      },
      prices
    );
    expect(cost).toBeCloseTo(50);
  });

  it('falls back to requested alias when resolved has no price entry', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000, output_tokens: 0 },
        __modelName: 'gpt-5.4',
        __resolvedModel: 'unknown-upstream',
      },
      prices
    );
    expect(cost).toBeCloseTo(50);
  });

  it('applies the tier multiplier to the requested price fallback', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000, output_tokens: 0 },
        __modelName: 'gpt-5.4',
        __resolvedModel: 'unknown-upstream',
        service_tier: 'priority',
      },
      prices
    );

    expect(cost).toBeCloseTo(100);
  });

  it('charges cached input tokens only at the cache price', () => {
    const cost = calculateCost(
      {
        tokens: {
          input_tokens: 750_000,
          output_tokens: 500_000,
          cached_tokens: 250_000,
        },
        __modelName: 'gpt-5.5',
      },
      {
        'gpt-5.5': { prompt: 2, completion: 4, cache: 1 },
      }
    );
    expect(cost).toBeCloseTo(3.75);
  });

  it('uses the unified GPT-5.6 cache-write and long-context policy', () => {
    const cost = calculateCost(
      {
        tokens: {
          input_tokens: 100_000,
          output_tokens: 10,
          cache_read_tokens: 73_000,
          cache_write_tokens: 100_000,
        },
        __modelName: 'openai/gpt-5.6-max',
      },
      {
        'gpt-5.6-sol': {
          prompt: 5,
          completion: 30,
          cache: 0.5,
          cacheRead: 0.5,
        },
      }
    );

    expect(cost).toBeCloseTo(2.32345);
  });

  it('uses explicit GPT-5.6 priority rates before long-context multipliers', () => {
    const cost = calculateCost(
      {
        tokens: {
          input_tokens: 100_000,
          output_tokens: 10,
          cache_read_tokens: 73_000,
          cache_write_tokens: 100_000,
        },
        __modelName: 'gpt-5.6',
        service_tier: 'priority',
      },
      {
        'gpt-5.6-sol': {
          prompt: 5,
          completion: 30,
          cache: 0.5,
          cacheRead: 0.5,
          promptPriority: 10,
          completionPriority: 60,
          cacheReadPriority: 1,
          cacheCreationPriority: 12.5,
        },
      }
    );

    expect(cost).toBeCloseTo(4.6469);
  });

  it('does not apply GPT-5.6 long-context multipliers at the 272K boundary', () => {
    const cost = calculateCost(
      {
        tokens: {
          input_tokens: 100_000,
          output_tokens: 10,
          cache_read_tokens: 72_000,
          cache_write_tokens: 100_000,
        },
        __modelName: 'gpt-5.6-sol',
      },
      {
        'gpt-5.6-sol': { prompt: 5, completion: 30, cache: 0.5, cacheRead: 0.5 },
      }
    );

    expect(cost).toBeCloseTo(1.1613);
  });

  it('prices fine-grained cache buckets outside input while preserving residual cached input', () => {
    const cost = calculateCost(
      {
        tokens: {
          input_tokens: 1_000_000,
          cached_tokens: 100_000,
          cache_read_tokens: 200_000,
          cache_creation_tokens: 100_000,
        },
        __modelName: 'mixed-cache',
      },
      {
        'mixed-cache': {
          prompt: 2,
          completion: 4,
          cache: 1,
          cacheRead: 0.5,
          cacheCreation: 3,
        },
      }
    );

    expect(cost).toBeCloseTo(2.4);
  });

  it('applies gpt-5.4 priority service tier multiplier', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000 },
        __modelName: 'gpt-5.4',
        service_tier: 'priority',
      },
      {
        'gpt-5.4': { prompt: 2.5, completion: 5, cache: 1 },
      }
    );

    expect(cost).toBeCloseTo(5);
  });

  it('applies gpt-5.5 priority service tier multiplier', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000 },
        __modelName: 'gpt-5.5',
        serviceTier: 'priority',
      },
      {
        'gpt-5.5': { prompt: 2, completion: 4, cache: 1 },
      }
    );

    expect(cost).toBeCloseTo(5);
  });

  it('keeps default and missing service tier at standard cost', () => {
    const modelPrices = {
      'gpt-5.4': { prompt: 2.5, completion: 5, cache: 1 },
    };

    expect(
      calculateCost(
        {
          tokens: { input_tokens: 1_000_000 },
          __modelName: 'gpt-5.4',
          service_tier: 'default',
        },
        modelPrices
      )
    ).toBeCloseTo(2.5);
    expect(
      calculateCost(
        {
          tokens: { input_tokens: 1_000_000 },
          __modelName: 'gpt-5.4',
        },
        modelPrices
      )
    ).toBeCloseTo(2.5);
  });

  it('does not guess priority multiplier for unknown models', () => {
    const cost = calculateCost(
      {
        tokens: { input_tokens: 1_000_000 },
        __modelName: 'unknown-model',
        service_tier: 'priority',
      },
      {
        'unknown-model': { prompt: 2.5, completion: 5, cache: 1 },
      }
    );

    expect(cost).toBeCloseTo(2.5);
  });
});

describe('getServiceTierMultiplier', () => {
  it('matches backend priority tier rules', () => {
    expect(getServiceTierMultiplier('gpt-5.4', 'default')).toBe(1);
    expect(getServiceTierMultiplier('gpt-5.4', 'priority')).toBe(2);
    expect(getServiceTierMultiplier('gpt-5.4', 'fast')).toBe(2);
    expect(getServiceTierMultiplier('gpt-5.4-mini', 'priority')).toBe(2);
    expect(getServiceTierMultiplier('gpt-5.5', 'priority')).toBe(2.5);
    expect(getServiceTierMultiplier('gpt-5.6-sol', 'priority')).toBe(2);
    expect(getServiceTierMultiplier('gpt-5.6-sol', 'flex')).toBe(0.5);
    expect(getServiceTierMultiplier('gpt-5.3-codex', 'priority')).toBe(2);
    expect(getServiceTierMultiplier('gpt-5.4', 'unknown')).toBe(1);
    expect(getServiceTierMultiplier('unknown-model', 'priority')).toBe(1);
  });
});

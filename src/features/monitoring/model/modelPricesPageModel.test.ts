import { describe, expect, it } from 'vitest';
import {
  applyCandidatePrice,
  buildSelectedSyncModels,
  buildPriceFromDraft,
  buildModelPriceRows,
  buildModelPriceSummary,
  buildSyncPriceModelsFromUsage,
  filterModelPriceRows,
} from './modelPricesPageModel';
import type { UsageModelCallStats } from '@/services/api/usageService';

// Successful calls only: the backend already excludes failures from these counters.
const modelCallStats: UsageModelCallStats[] = [
  { model: 'alias-fast', calls: 1, requested_calls: 1, resolved_calls: 0 },
  { model: 'gpt-5.5', calls: 1, requested_calls: 0, resolved_calls: 1 },
];

describe('modelPricesPageModel', () => {
  it('builds sync models from requested, resolved, and saved prices', () => {
    expect(
      buildSyncPriceModelsFromUsage(modelCallStats, {
        'manual-model': { prompt: 1, completion: 2, cache: 0.5 },
      })
    ).toEqual(['alias-fast', 'gpt-5.5', 'manual-model']);
  });

  it('uses checked models when present and falls back to the full sync scope', () => {
    expect(buildSelectedSyncModels(['a', 'b'], {})).toEqual(['a', 'b']);
    expect(buildSelectedSyncModels(['a', 'b'], { b: true })).toEqual(['b']);
  });

  it('marks missing models with candidates before saved rows', () => {
    const rows = buildModelPriceRows(
      modelCallStats,
      {
        'gpt-5.5': { prompt: 1, completion: 2, cache: 0.5 },
      },
      [
        {
          model: 'alias-fast',
          candidates: [
            {
              sourceModelId: 'openai/gpt-5.5',
              score: 0.75,
              reason: 'similar',
              price: { prompt: 1, completion: 2, cache: 0.5 },
            },
          ],
        },
      ]
    );

    expect(rows[0]).toMatchObject({
      model: 'alias-fast',
      hasPrice: false,
      candidateCount: 1,
      requestedCalls: 1,
      calls: 1,
    });
    expect(buildModelPriceSummary(rows)).toMatchObject({
      total: 2,
      saved: 1,
      missing: 1,
      candidates: 1,
    });
    expect(filterModelPriceRows(rows, 'candidates', '')).toHaveLength(1);
  });

  it('counts resolved response models as their own rows', () => {
    const rows = buildModelPriceRows(modelCallStats, {
      'alias-fast': { prompt: 1, completion: 2, cache: 0.5 },
    });

    expect(rows.find((row) => row.model === 'alias-fast')).toMatchObject({
      calls: 1,
      requestedCalls: 1,
      resolvedCalls: 0,
      hasPrice: true,
    });
    expect(rows.find((row) => row.model === 'gpt-5.5')).toMatchObject({
      calls: 1,
      requestedCalls: 0,
      resolvedCalls: 1,
      hasPrice: false,
    });
  });

  it('applies a candidate under the local model name', () => {
    const next = applyCandidatePrice({}, 'alias-fast', {
      sourceModelId: 'openai/gpt-5.5',
      score: 0.75,
      reason: 'similar',
      price: { prompt: 1, completion: 2, cache: 0.5, source: 'openrouter' },
    });

    expect(next['alias-fast']).toMatchObject({
      prompt: 1,
      completion: 2,
      cache: 0.5,
      source: 'openrouter',
      sourceModelId: 'openai/gpt-5.5',
    });
  });

  it('marks manually entered prices with a manual source', () => {
    expect(
      buildPriceFromDraft({
        model: 'manual-model',
        prompt: '1',
        completion: '2',
        cacheRead: '0.5',
        cacheCreation: '3',
      })
    ).toMatchObject({
      prompt: 1,
      completion: 2,
      cache: 0.5,
      cacheRead: 0.5,
      cacheCreation: 3,
      source: 'manual',
    });
  });
});

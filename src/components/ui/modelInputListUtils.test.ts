import { describe, expect, it } from 'vitest';
import { entriesToModels, modelsToEntries } from './modelInputListUtils';

describe('modelInputListUtils', () => {
  it('preserves thinking configuration through model editor conversion', () => {
    const models = [
      {
        name: 'glm-5.3',
        alias: 'glm-5.3',
        thinking: {
          levels: ['medium'],
          level_mapping: { high: 'medium' },
        },
      },
    ];

    expect(entriesToModels(modelsToEntries(models))).toEqual([
      {
        name: 'glm-5.3',
        thinking: {
          levels: ['medium'],
          level_mapping: { high: 'medium' },
        },
      },
    ]);
  });
});

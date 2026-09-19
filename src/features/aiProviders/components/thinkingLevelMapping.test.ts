import { describe, expect, it } from 'vitest';
import {
  hasDuplicateMappingSources,
  parseThinkingConfig,
  serializeThinkingLevelMapping,
} from './thinkingLevelMapping';

describe('thinking level mapping editor data', () => {
  it('loads existing level_mapping rows without changing other thinking settings', () => {
    const parsed = parseThinkingConfig(
      '{"levels":["low","medium"],"level_mapping":{"high":"medium","xhigh":"medium"}}'
    );

    expect(parsed.error).toBeNull();
    expect(parsed.rows).toEqual([
      { from: 'high', to: 'medium' },
      { from: 'xhigh', to: 'medium' },
    ]);
    expect(parsed.config.levels).toEqual(['low', 'medium']);
  });

  it('serializes valid rows as the backend level_mapping field and drops blank rows', () => {
    const value = serializeThinkingLevelMapping(
      { levels: ['low', 'medium'], min: 'low' },
      [
        { from: 'high', to: 'medium' },
        { from: '', to: '' },
      ]
    );

    expect(JSON.parse(value)).toEqual({
      levels: ['low', 'medium'],
      min: 'low',
      level_mapping: { high: 'medium' },
    });
  });

  it('flags duplicate sources and treats case and whitespace consistently', () => {
    expect(
      hasDuplicateMappingSources([
        { from: ' high ', to: 'medium' },
        { from: 'HIGH', to: 'low' },
      ])
    ).toBe(true);
  });

  it('removes level_mapping when its final row is deleted', () => {
    const value = serializeThinkingLevelMapping(
      { levels: ['medium'], level_mapping: { high: 'medium' } },
      []
    );

    expect(JSON.parse(value)).toEqual({ levels: ['medium'] });
  });
});

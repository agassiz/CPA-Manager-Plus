import { describe, expect, it } from 'vitest';
import { applyThinkingLevels, readThinkingLevels } from './thinkingLevels';

describe('thinking levels', () => {
  it('reads levels and folds the zero/dynamic flags into none/auto', () => {
    expect(
      readThinkingLevels({ levels: ['High', 'low', 'bogus'], zero_allowed: true, dynamic_allowed: true })
    ).toEqual(['none', 'low', 'high', 'auto']);
    expect(readThinkingLevels(undefined)).toEqual([]);
  });

  it('writes levels while keeping unrelated keys', () => {
    expect(
      applyThinkingLevels({ min: 1, level_mapping: { xhigh: 'high' }, zero_allowed: true }, [
        'high',
        'none',
        'low',
      ])
    ).toEqual({ min: 1, level_mapping: { xhigh: 'high' }, levels: ['low', 'high', 'none'] });
  });

  it('drops the config when nothing is left', () => {
    expect(applyThinkingLevels({ levels: ['low'] }, [])).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { CLINE_CONFIG } from './quotaConfigs';

describe('Cline quota config', () => {
  it('selects only enabled Cline credentials', () => {
    expect(CLINE_CONFIG.filterFn({ name: 'cline.json', provider: 'cline' })).toBe(true);
    expect(CLINE_CONFIG.filterFn({ name: 'devin.json', provider: 'devin' })).toBe(false);
    expect(CLINE_CONFIG.filterFn({ name: 'off.json', provider: 'cline', disabled: true })).toBe(
      false
    );
  });

  it('uses a dedicated store and balance state builders', () => {
    expect(CLINE_CONFIG.storeSetter).toBe('setClineQuota');
    expect(CLINE_CONFIG.buildSuccessState({ balanceMicroUsd: 49635 })).toEqual({
      status: 'success',
      balance: { balanceMicroUsd: 49635 },
    });
    expect(CLINE_CONFIG.buildErrorState('boom', 401, true)).toMatchObject({
      status: 'error',
      balance: null,
      errorStatus: 401,
      upstreamError: true,
    });
  });
});

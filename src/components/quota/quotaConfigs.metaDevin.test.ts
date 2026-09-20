import { describe, expect, it } from 'vitest';
import { DEVIN_CONFIG, META_CONFIG } from './quotaConfigs';

describe('Meta and Devin quota configs', () => {
  it('selects only enabled credentials for each provider', () => {
    expect(DEVIN_CONFIG.filterFn({ name: 'devin.json', provider: 'devin' })).toBe(true);
    expect(DEVIN_CONFIG.filterFn({ name: 'meta.json', provider: 'meta' })).toBe(false);
    expect(
      DEVIN_CONFIG.filterFn({ name: 'disabled.json', provider: 'devin', disabled: true })
    ).toBe(false);

    expect(META_CONFIG.filterFn({ name: 'meta.json', provider: 'meta' })).toBe(true);
    expect(META_CONFIG.filterFn({ name: 'devin.json', provider: 'devin' })).toBe(false);
    expect(META_CONFIG.filterFn({ name: 'disabled.json', provider: 'meta', disabled: true })).toBe(
      false
    );
  });

  it('uses dedicated stores and state builders', () => {
    expect(DEVIN_CONFIG.storeSetter).toBe('setDevinQuota');
    expect(META_CONFIG.storeSetter).toBe('setMetaQuota');
    expect(
      DEVIN_CONFIG.buildSuccessState({
        windows: [],
        observedAtMs: null,
        plan: null,
        planStartMs: null,
        planEndMs: null,
      })
    ).toMatchObject({ status: 'success', windows: [] });
    expect(META_CONFIG.buildSuccessState({ windows: [] })).toEqual({
      status: 'success',
      data: { windows: [] },
    });
  });
});

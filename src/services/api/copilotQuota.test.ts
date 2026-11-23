import { describe, expect, it } from 'vitest';
import { parseCopilotQuota } from './copilotQuota';

const snapshot = {
  quota_remaining: 1150.9,
  remaining: 1150,
  entitlement: 20000,
  percent_remaining: 5.7,
};
const payload = (premium: unknown) => ({
  login: 'fixture-account',
  quota_snapshots: { premium_interactions: premium },
});

describe('Copilot quota response', () => {
  it('reads the premium interactions snapshot', () => {
    expect(parseCopilotQuota(payload(snapshot))).toEqual({
      remaining: 1150.9,
      entitlement: 20000,
      percentRemaining: 5.7,
    });
  });

  it('treats zero as a valid exhausted quota', () => {
    expect(
      parseCopilotQuota(payload({ ...snapshot, quota_remaining: 0, percent_remaining: 0 }))
    ).toEqual({ remaining: 0, entitlement: 20000, percentRemaining: 0 });
  });

  it('rejects missing, unlimited and malformed snapshots', () => {
    for (const premium of [
      undefined,
      {},
      { ...snapshot, unlimited: true },
      { ...snapshot, has_quota: false },
      { ...snapshot, percent_remaining: 100.5 },
      { ...snapshot, percent_remaining: null },
      { ...snapshot, quota_remaining: -1 },
      { ...snapshot, entitlement: '20000' },
    ]) {
      expect(parseCopilotQuota(payload(premium))).toBeNull();
    }
    expect(parseCopilotQuota(null)).toBeNull();
    expect(parseCopilotQuota({ login: 'fixture-account' })).toBeNull();
    expect(parseCopilotQuota(JSON.stringify(payload(snapshot)))).toBeNull();
  });
});

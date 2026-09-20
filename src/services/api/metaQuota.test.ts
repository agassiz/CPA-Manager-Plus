import { describe, expect, it } from 'vitest';
import { parseMetaQuotaPayload } from './metaQuota';

describe('parseMetaQuotaPayload', () => {
  it('keeps only subscription and quota display fields', () => {
    const result = parseMetaQuotaPayload({
      subs_tier_name: 'Muse Code Everyday Usage',
      is_subs_active: true,
      api_key: 'must-not-propagate',
      user_email: 'user@example.test',
      subs_usage: {
        window: { used_percent: 2, resets_at: 1789678120, window_duration_mins: 300 },
        weekly: { used_percent: 0, resets_at: 1789948800 },
      },
    });

    expect(result).toEqual({
      planName: 'Muse Code Everyday Usage',
      isSubscriptionActive: true,
      windows: [
        { id: 'window', usedPercent: 2, resetAt: 1789678120, durationMinutes: 300 },
        { id: 'weekly', usedPercent: 0, resetAt: 1789948800 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-propagate');
    expect(JSON.stringify(result)).not.toContain('user@example.test');
  });

  it('preserves unknown quota without turning it into full quota', () => {
    expect(parseMetaQuotaPayload({ subs_usage: {} })?.windows).toEqual([
      { id: 'window', usedPercent: null },
      { id: 'weekly', usedPercent: null },
    ]);
  });

  it.each(['{not-json', '', 'null', '[]', null, undefined, [], 42])(
    'rejects malformed payload %s',
    (payload) => {
      expect(parseMetaQuotaPayload(payload)).toBeNull();
    }
  );
});

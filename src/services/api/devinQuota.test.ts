import { describe, expect, it } from 'vitest';
import { hasDevinQuotaObservation, readDevinQuotaResponse } from './devinQuota';

describe('readDevinQuotaResponse', () => {
  it('normalizes quota windows and plan metadata', () => {
    const result = readDevinQuotaResponse(
      {
        userStatus: {
          email: 'user@example.test',
          planStatus: {
            planInfo: { planName: 'Pro' },
            planStart: '2026-09-11T00:42:44Z',
            planEnd: '2026-10-11T00:42:44Z',
            dailyQuotaRemainingPercent: 54,
            weeklyQuotaRemainingPercent: '77',
            dailyQuotaResetAtUnix: '1789372800',
            weeklyQuotaResetAtUnix: 1789891200,
          },
        },
      },
      1234
    );

    expect(result).toEqual({
      windows: [
        { id: 'daily', remainingPercent: 54, resetAtMs: 1789372800000, periodHours: 24 },
        { id: 'weekly', remainingPercent: 77, resetAtMs: 1789891200000, periodHours: 168 },
      ],
      observedAtMs: 1234,
      plan: 'Pro',
      planStartMs: Date.parse('2026-09-11T00:42:44Z'),
      planEndMs: Date.parse('2026-10-11T00:42:44Z'),
    });
    expect(JSON.stringify(result)).not.toContain('user@example.test');
  });

  it('does not invent quota from malformed data', () => {
    const result = readDevinQuotaResponse({ metadata: { dailyQuotaRemainingPercent: 100 } });
    expect(hasDevinQuotaObservation(result)).toBe(false);
    expect(result.observedAtMs).toBeNull();
    expect(result.windows.every((window) => window.remainingPercent === null)).toBe(true);
  });
});

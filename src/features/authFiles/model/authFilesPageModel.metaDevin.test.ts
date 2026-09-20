import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { buildAuthFileTableQuotaItems } from './authFilesPageModel';

const t = ((key: string, params?: Record<string, unknown>) =>
  params?.minutes ? `${key}:${params.minutes}` : key) as TFunction;

describe('Meta and Devin auth-file table quota items', () => {
  it('renders Devin plan-independent quota windows', () => {
    const items = buildAuthFileTableQuotaItems(
      'devin',
      {
        status: 'success',
        windows: [
          {
            id: 'daily',
            remainingPercent: 45,
            resetAtMs: Date.parse('2026-09-21T00:00:00Z'),
            periodHours: 24,
          },
          { id: 'weekly', remainingPercent: 75, resetAtMs: null, periodHours: 168 },
        ],
        observedAtMs: 1,
        plan: 'Pro',
        planStartMs: null,
        planEndMs: null,
      },
      t
    );

    expect(items.map((item) => [item.id, item.remainingPercent])).toEqual([
      ['plan', null],
      ['daily', 45],
      ['weekly', 75],
    ]);
  });

  it('converts Meta used percentages into remaining percentages', () => {
    const items = buildAuthFileTableQuotaItems(
      'meta',
      {
        status: 'success',
        data: {
          planName: 'Muse plan',
          isSubscriptionActive: true,
          windows: [
            { id: 'window', usedPercent: 2, durationMinutes: 300 },
            { id: 'weekly', usedPercent: 100 },
          ],
        },
      },
      t
    );

    expect(items.map((item) => [item.id, item.remainingPercent])).toEqual([
      ['plan', null],
      ['window', 98],
      ['weekly', 0],
    ]);
    expect(items[1]?.label).toBe('meta_quota.window_duration:300');
  });
});

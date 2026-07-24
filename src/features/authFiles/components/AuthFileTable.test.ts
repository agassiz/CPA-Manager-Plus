import { describe, expect, it } from 'vitest';
import {
  buildAuthFileTableQuotaItems,
  formatXaiCurrencyCents,
  getAuthFileTableQuotaItems,
  getAntigravityTableQuotaItems,
  getCodexTableQuotaWindows,
  getXaiTableQuotaBilling,
  type AuthFileCodexStatusSummary,
} from '@/features/authFiles/model/authFilesPageModel';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState,
  KiroQuotaState,
  XaiQuotaState,
} from '@/types/quota';

const emptyCodexStatus = {
  isCodex: true,
  isHttp401: false,
  needsReauth: false,
  isFiveHourLimited: false,
  isWeeklyLimited: false,
  isMonthlyLimited: false,
  hasDisabledRecoveryReset: false,
  fiveHourResetLabel: null,
  weeklyResetLabel: null,
  monthlyResetLabel: null,
  recoveryResetLabel: null,
  fiveHourUsedPercent: null,
  weeklyUsedPercent: null,
  monthlyUsedPercent: null,
  badges: [],
} satisfies AuthFileCodexStatusSummary;

describe('getCodexTableQuotaWindows', () => {
  it('保留卡片模式中的全部额度窗口，包括 720 小时额度', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      planType: 'plus',
      windows: [
        {
          id: 'five-hour',
          label: '5 小时限额',
          labelKey: 'codex_quota.primary_window',
          usedPercent: 20,
          resetLabel: '1 小时后',
          limitWindowSeconds: 18_000,
        },
        {
          id: 'monthly',
          label: '月限额',
          labelKey: 'codex_quota.monthly_window',
          usedPercent: 40,
          resetLabel: '720 小时后',
          limitWindowSeconds: 2_592_000,
        },
      ],
    };

    expect(getCodexTableQuotaWindows(quota, emptyCodexStatus)).toEqual(quota.windows);
  });

  it('额度窗口尚未加载时保留状态摘要中的月度额度', () => {
    const status = {
      ...emptyCodexStatus,
      monthlyUsedPercent: 40,
      monthlyResetLabel: '720 小时后',
    } satisfies AuthFileCodexStatusSummary;

    expect(getCodexTableQuotaWindows(undefined, status)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'monthly',
          usedPercent: 40,
          resetLabel: '720 小时后',
        }),
      ])
    );
  });
});


describe('getXaiTableQuotaBilling', () => {
  it('成功态返回与卡片模式一致的账单摘要', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: {
        monthlyLimitCents: 1000,
        usedCents: 250,
        onDemandCapCents: 5000,
        billingPeriodEnd: '2026-08-01T00:00:00Z',
        usedPercent: 25,
      },
    };

    expect(getXaiTableQuotaBilling(quota)).toEqual(quota.billing);
  });

  it('非成功态或缺少账单时不展示额度', () => {
    expect(getXaiTableQuotaBilling(undefined)).toBeNull();
    expect(getXaiTableQuotaBilling({ status: 'loading', billing: null })).toBeNull();
    expect(getXaiTableQuotaBilling({ status: 'success', billing: null })).toBeNull();
  });
});

describe('formatXaiCurrencyCents', () => {
  it('按美分格式化为美元金额', () => {
    expect(formatXaiCurrencyCents(null)).toBe('--');
    expect(formatXaiCurrencyCents(0)).toBe('$0.00');
    expect(formatXaiCurrencyCents(250)).toBe('$2.50');
  });
});


const t = ((key: string, options?: Record<string, unknown>) => {
  if (options && 'used' in options && 'limit' in options) {
    return `${options.used} / ${options.limit}`;
  }
  if (options && 'count' in options) {
    return `${key}:${options.count}`;
  }
  if (options && 'hint' in options) {
    return `${key}:${options.hint}`;
  }
  if (options && 'defaultValue' in options && typeof options.defaultValue === 'string') {
    return options.defaultValue;
  }
  return key;
}) as never;

describe('buildAuthFileTableQuotaItems', () => {
  it('claude 展示 plan / extra / 窗口进度', () => {
    const quota: ClaudeQuotaState = {
      status: 'success',
      planType: 'pro',
      extraUsage: {
        is_enabled: true,
        monthly_limit: 10000,
        used_credits: 2500,
        utilization: 0.25,
      },
      windows: [
        {
          id: 'five-hour',
          label: '5h',
          labelKey: 'claude_quota.five_hour',
          usedPercent: 30,
          resetLabel: '2h',
        },
      ],
    };

    const items = buildAuthFileTableQuotaItems('claude', quota, t);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plan', kind: 'meta' }),
        expect.objectContaining({ id: 'extra', kind: 'meta', detail: '$25.00 / $100.00' }),
        expect.objectContaining({
          id: 'five-hour',
          kind: 'progress',
          remainingPercent: 70,
          detail: '2h',
        }),
      ])
    );
  });

  it('antigravity 展示模型组剩余与积分', () => {
    const quota: AntigravityQuotaState = {
      status: 'success',
      groups: [
        {
          id: 'pro',
          label: 'Pro models',
          models: ['a', 'b'],
          remainingFraction: 0.42,
          resetTime: '2026-08-01T00:00:00Z',
        },
      ],
      creditBalance: 12,
    };

    const items = buildAuthFileTableQuotaItems('antigravity', quota, t);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'pro',
        kind: 'progress',
        remainingPercent: 42,
      })
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'credits', kind: 'meta' }),
      ])
    );
  });

  it('gemini-cli 展示 tier / credits / buckets', () => {
    const quota: GeminiCliQuotaState = {
      status: 'success',
      tierLabel: 'Ultra',
      creditBalance: 3,
      buckets: [
        {
          id: 'flash',
          label: 'Flash',
          remainingFraction: 0.8,
          remainingAmount: 100,
          resetTime: '2026-08-01T00:00:00Z',
          tokenType: 'input',
        },
      ],
    };

    const items = buildAuthFileTableQuotaItems('gemini-cli', quota, t);
    expect(items.map((item) => item.id)).toEqual(['tier', 'credits', 'flash']);
    expect(items[2]).toEqual(
      expect.objectContaining({
        kind: 'progress',
        remainingPercent: 80,
      })
    );
  });

  it('kimi 展示 row 剩余百分比', () => {
    const quota: KimiQuotaState = {
      status: 'success',
      rows: [
        {
          id: 'rpm',
          label: 'RPM',
          used: 20,
          limit: 100,
          resetHint: '1h',
        },
      ],
    };

    expect(buildAuthFileTableQuotaItems('kimi', quota, t)).toEqual([
      expect.objectContaining({
        id: 'rpm',
        remainingPercent: 80,
        kind: 'progress',
      }),
    ]);
  });

  it('kiro 展示订阅与基础额度', () => {
    const quota: KiroQuotaState = {
      status: 'success',
      subscriptionTitle: 'KIRO PRO',
      baseQuota: { used: 25, limit: 100, resetTime: 1_800_000_000 },
      freeTrialQuota: null,
      overageQuota: null,
      overageStatus: 'ENABLED',
    };

    const items = buildAuthFileTableQuotaItems('kiro', quota, t);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'subscription', kind: 'meta', detail: 'KIRO PRO' }),
        expect.objectContaining({ id: 'overage-status', kind: 'meta' }),
        expect.objectContaining({ id: 'base', kind: 'progress', remainingPercent: 75 }),
      ])
    );
  });

  it('xai 成功态展示月度账单与按需上限', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: {
        monthlyLimitCents: 1000,
        usedCents: 250,
        onDemandCapCents: 5000,
        billingPeriodEnd: '2026-08-01T00:00:00Z',
        usedPercent: 25,
      },
    };

    const items = buildAuthFileTableQuotaItems('xai', quota, t);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'monthly',
          kind: 'progress',
          remainingPercent: 75,
        }),
        expect.objectContaining({
          id: 'on-demand-cap',
          kind: 'meta',
          detail: '$50.00',
        }),
      ])
    );
  });

  it('非成功态不展示（codex 除外）', () => {
    expect(
      buildAuthFileTableQuotaItems('claude', { status: 'loading', windows: [] }, t)
    ).toEqual([]);
  });
});

describe('兼容列表额度项', () => {
  it('保留一个凭证下的全部 Antigravity 模型额度', () => {
    const quota: AntigravityQuotaState = {
      status: 'success',
      groups: [
        {
          id: 'claude',
          label: 'Claude 4.5',
          models: ['claude-sonnet-4-5'],
          remainingFraction: 0.82,
          resetTime: '2026-07-29T07:52:00.000Z',
        },
        {
          id: 'gemini',
          label: 'Gemini 2.5 Pro',
          models: ['gemini-2.5-pro'],
          remainingFraction: 1,
          resetTime: '2026-07-29T07:52:00.000Z',
        },
      ],
    };

    expect(getAntigravityTableQuotaItems(quota)).toEqual([
      expect.objectContaining({ id: 'claude', label: 'Claude 4.5', percent: 82 }),
      expect.objectContaining({ id: 'gemini', label: 'Gemini 2.5 Pro', percent: 100 }),
    ]);
  });

  it('生成其他供应商的兼容额度项', () => {
    const t = ((key: string, params?: Record<string, unknown>) =>
      params?.count === undefined ? key : `${key}:${params.count}`) as never;

    expect(
      getAuthFileTableQuotaItems(
        'claude',
        {
          status: 'success',
          windows: [{ id: 'five-hour', label: '5h', usedPercent: 25, resetLabel: '18:00' }],
        },
        t
      )
    ).toEqual([expect.objectContaining({ id: 'five-hour', percent: 75 })]);

    expect(
      getAuthFileTableQuotaItems(
        'gemini-cli',
        {
          status: 'success',
          buckets: [
            {
              id: 'gemini-pro',
              label: 'Gemini Pro',
              remainingFraction: 0.6,
              remainingAmount: 12,
            },
          ],
        },
        t
      )
    ).toEqual([expect.objectContaining({ id: 'gemini-pro', percent: 60 })]);

    expect(
      getAuthFileTableQuotaItems(
        'kimi',
        { status: 'success', rows: [{ id: 'weekly', label: 'Weekly', used: 20, limit: 100 }] },
        t
      )
    ).toEqual([expect.objectContaining({ id: 'weekly', percent: 80 })]);

    expect(
      getAuthFileTableQuotaItems(
        'kiro',
        {
          status: 'success',
          baseQuota: { used: 25, limit: 100, resetTime: 1_785_304_320 },
          freeTrialQuota: null,
          overageQuota: null,
          subscriptionTitle: 'KIRO PRO+',
        },
        t
      )
    ).toEqual([expect.objectContaining({ id: 'base', percent: 75 })]);

    expect(
      getAuthFileTableQuotaItems(
        'xai',
        {
          status: 'success',
          billing: {
            usedPercent: 40,
            usedCents: 400,
            monthlyLimitCents: 1000,
            onDemandCapCents: null,
          },
        },
        t
      )
    ).toEqual([expect.objectContaining({ id: 'monthly-limit', percent: 60 })]);
  });
});

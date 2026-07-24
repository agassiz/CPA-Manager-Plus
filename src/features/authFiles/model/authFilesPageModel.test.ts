import { describe, expect, it } from 'vitest';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import {
  authFileMatchesCodexStatusFilter,
  authFileMatchesProblemTypeFilter,
  buildAuthFileCodexInspectionMap,
  compareAuthFileDisabledLast,
  compareAuthFileModifiedDesc,
  getAuthFileCodexInspectionKey,
  getAuthFileModifiedTime,
  getAuthFileCodexStatus,
  getAuthFilePlanSortRank,
  getAuthFileProblemStatusCode,
  getAuthFileProblemTypeFilter,
  getAuthFileSearchValues,
  normalizeAuthFilesCodexStatusFilter,
  normalizeAuthFilesProblemTypeFilter,
  stringifySearchValue,
  type AuthFileCodexInspectionSnapshot,
} from './authFilesPageModel';

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as never;

const codexFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'codex-main.json',
  type: 'codex',
  authIndex: 'codex-main',
  ...overrides,
});

const codexQuota = (overrides: Partial<CodexQuotaState> = {}): CodexQuotaState => ({
  status: 'success',
  windows: [
    {
      id: 'five-hour',
      label: '5-hour limit',
      usedPercent: 10,
      resetLabel: '06/01 17:00',
      limitWindowSeconds: 18_000,
    },
    {
      id: 'weekly',
      label: 'Weekly limit',
      usedPercent: 100,
      resetLabel: '06/04 12:00',
      limitWindowSeconds: 604_800,
    },
  ],
  ...overrides,
});

describe('auth file problem type helpers', () => {
  it('normalizes persisted problem type filters', () => {
    expect(normalizeAuthFilesProblemTypeFilter('all')).toBe('all');
    expect(normalizeAuthFilesProblemTypeFilter('400')).toBe('400');
    expect(normalizeAuthFilesProblemTypeFilter('401')).toBe('401');
    expect(normalizeAuthFilesProblemTypeFilter('403')).toBe('403');
    expect(normalizeAuthFilesProblemTypeFilter('other')).toBe('other');
    expect(normalizeAuthFilesProblemTypeFilter('500')).toBeNull();
    expect(normalizeAuthFilesProblemTypeFilter(undefined)).toBeNull();
  });

  it('reads problem status codes from supported backend field names', () => {
    expect(getAuthFileProblemStatusCode({ name: 'a.json', errorStatus: '400' })).toBe(400);
    expect(getAuthFileProblemStatusCode({ name: 'b.json', error_status: 401.9 })).toBe(401);
    expect(getAuthFileProblemStatusCode({ name: 'c.json', statusCode: '403' })).toBe(403);
    expect(getAuthFileProblemStatusCode({ name: 'd.json', status_code: 'bad' })).toBeNull();
  });

  it('groups common problem status codes and falls back to other', () => {
    expect(getAuthFileProblemTypeFilter({ name: 'bad-request.json', errorStatus: 400 })).toBe(
      '400'
    );
    expect(getAuthFileProblemTypeFilter({ name: 'unauthorized.json', errorStatus: 401 })).toBe(
      '401'
    );
    expect(getAuthFileProblemTypeFilter({ name: 'forbidden.json', errorStatus: 403 })).toBe('403');
    expect(getAuthFileProblemTypeFilter({ name: 'server-error.json', errorStatus: 500 })).toBe(
      'other'
    );
    expect(getAuthFileProblemTypeFilter({ name: 'unknown.json' })).toBe('other');
  });

  it('matches files against selected problem type filters', () => {
    const file = { name: 'unauthorized.json', errorStatus: 401 };

    expect(authFileMatchesProblemTypeFilter(file, 'all')).toBe(true);
    expect(authFileMatchesProblemTypeFilter(file, '401')).toBe(true);
    expect(authFileMatchesProblemTypeFilter(file, '400')).toBe(false);
    expect(
      authFileMatchesProblemTypeFilter({ name: 'server-error.json', errorStatus: 500 }, 'other')
    ).toBe(true);
  });
});

describe('auth file sorting helpers', () => {
  it('places disabled files after enabled files', () => {
    const enabled = codexFile({ name: 'enabled.json' });
    const disabled = codexFile({ name: 'disabled.json', disabled: true });

    expect(compareAuthFileDisabledLast(enabled, disabled)).toBeLessThan(0);
    expect(compareAuthFileDisabledLast(disabled, enabled)).toBeGreaterThan(0);
    expect(compareAuthFileDisabledLast(enabled, codexFile({ name: 'other.json' }))).toBe(0);
  });

  it('orders newer modified times first and keeps unknowns last', () => {
    const older = codexFile({ name: 'older.json', modified: 1_000 });
    const newer = codexFile({ name: 'newer.json', modified: 2_000 });
    const unknown = codexFile({ name: 'unknown.json' });

    expect(getAuthFileModifiedTime(newer)).toBe(2_000);
    expect(compareAuthFileModifiedDesc(newer, older)).toBeLessThan(0);
    expect(compareAuthFileModifiedDesc(older, newer)).toBeGreaterThan(0);
    expect(compareAuthFileModifiedDesc(newer, unknown)).toBeLessThan(0);
    expect(compareAuthFileModifiedDesc(unknown, newer)).toBeGreaterThan(0);
    expect(compareAuthFileModifiedDesc(newer, codexFile({ name: 'same.json', modified: 2_000 }))).toBe(0);
  });
});

describe('auth file Codex status helpers', () => {
  it('uses refreshed quota plan before the persisted file plan for sorting', () => {
    expect(
      getAuthFilePlanSortRank(
        codexFile({ plan_type: 'free' }),
        codexQuota({ planType: 'pro', windows: [] })
      )
    ).toBeGreaterThan(getAuthFilePlanSortRank(codexFile({ plan_type: 'plus' })) ?? 0);
  });

  it('detects weekly-limited Codex quota from the weekly quota window', () => {
    const status = getAuthFileCodexStatus(codexFile(), codexQuota());

    expect(status.isCodex).toBe(true);
    expect(status.isWeeklyLimited).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(true);
    expect(status.badges.map((badge) => badge.kind)).toContain('weekly_limited');
  });

  it('detects five-hour limited Codex quota from the short quota window', () => {
    const status = getAuthFileCodexStatus(
      codexFile(),
      codexQuota({
        windows: [
          {
            id: 'five-hour',
            label: '5-hour limit',
            usedPercent: 100,
            resetLabel: '06/01 17:00',
            limitWindowSeconds: 18_000,
          },
          {
            id: 'weekly',
            label: 'Weekly limit',
            usedPercent: 45,
            resetLabel: '06/04 12:00',
            limitWindowSeconds: 604_800,
          },
        ],
      })
    );

    expect(status.isFiveHourLimited).toBe(true);
    expect(status.isWeeklyLimited).toBe(false);
    expect(status.fiveHourResetLabel).toBe('06/01 17:00');
    expect(authFileMatchesCodexStatusFilter(status, 'five_hour_limited')).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(false);
    expect(status.badges.map((badge) => badge.kind)).toContain('five_hour_limited');
  });

  it('detects monthly-limited Codex quota without treating it as weekly-limited', () => {
    const status = getAuthFileCodexStatus(
      codexFile(),
      codexQuota({
        windows: [
          {
            id: 'monthly',
            label: 'Monthly limit',
            usedPercent: 100,
            resetLabel: '06/30 12:00',
            limitWindowSeconds: 2_592_000,
          },
        ],
      })
    );

    expect(status.isMonthlyLimited).toBe(true);
    expect(status.isWeeklyLimited).toBe(false);
    expect(status.monthlyResetLabel).toBe('06/30 12:00');
    expect(authFileMatchesCodexStatusFilter(status, 'monthly_limited')).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(false);
    expect(status.badges.map((badge) => badge.kind)).toContain('monthly_limited');
  });

  it('detects disabled Codex files with a known quota recovery label', () => {
    const status = getAuthFileCodexStatus(codexFile({ disabled: true }), codexQuota());

    expect(status.hasDisabledRecoveryReset).toBe(true);
    expect(status.weeklyResetLabel).toBe('06/04 12:00');
    expect(status.recoveryResetLabel).toBe('06/04 12:00');
    expect(authFileMatchesCodexStatusFilter(status, 'disabled_with_reset')).toBe(true);
    expect(status.badges.find((badge) => badge.kind === 'disabled_with_reset')).toMatchObject({
      labelParams: { reset: '06/04 12:00' },
    });
  });

  it('uses the five-hour reset label for disabled files when only the short window is full', () => {
    const status = getAuthFileCodexStatus(
      codexFile({ disabled: true }),
      codexQuota({
        windows: [
          {
            id: 'five-hour',
            label: '5-hour limit',
            usedPercent: 100,
            resetLabel: '06/01 17:00',
            limitWindowSeconds: 18_000,
          },
          {
            id: 'weekly',
            label: 'Weekly limit',
            usedPercent: 45,
            resetLabel: '06/04 12:00',
            limitWindowSeconds: 604_800,
          },
        ],
      })
    );

    expect(status.hasDisabledRecoveryReset).toBe(true);
    expect(status.recoveryResetLabel).toBe('06/01 17:00');
    expect(status.badges.find((badge) => badge.kind === 'disabled_with_reset')).toMatchObject({
      labelParams: { reset: '06/01 17:00' },
    });
  });

  it('uses the monthly reset label for disabled files when the monthly window is full', () => {
    const status = getAuthFileCodexStatus(
      codexFile({ disabled: true }),
      codexQuota({
        windows: [
          {
            id: 'monthly',
            label: 'Monthly limit',
            usedPercent: 100,
            resetLabel: '06/30 12:00',
            limitWindowSeconds: 2_592_000,
          },
        ],
      })
    );

    expect(status.hasDisabledRecoveryReset).toBe(true);
    expect(status.recoveryResetLabel).toBe('06/30 12:00');
    expect(status.badges.find((badge) => badge.kind === 'disabled_with_reset')).toMatchObject({
      labelParams: { reset: '06/30 12:00' },
    });
  });

  it('does not mark manually disabled Codex files as waiting recovery when quota is available', () => {
    const status = getAuthFileCodexStatus(
      codexFile({ disabled: true }),
      codexQuota({
        windows: [
          {
            id: 'five-hour',
            label: '5-hour limit',
            usedPercent: 10,
            resetLabel: '06/01 17:00',
            limitWindowSeconds: 18_000,
          },
          {
            id: 'weekly',
            label: 'Weekly limit',
            usedPercent: 45,
            resetLabel: '06/04 12:00',
            limitWindowSeconds: 604_800,
          },
        ],
      })
    );

    expect(status.hasDisabledRecoveryReset).toBe(false);
    expect(authFileMatchesCodexStatusFilter(status, 'disabled_with_reset')).toBe(false);
  });

  it('detects HTTP 401 and reauth needs from the latest inspection result', () => {
    const status = getAuthFileCodexStatus(codexFile(), undefined, {
      fileName: 'codex-main.json',
      authIndex: 'codex-main',
      statusCode: 401,
      action: 'reauth',
      usedPercent: null,
      isQuota: false,
    });

    expect(status.isHttp401).toBe(true);
    expect(status.needsReauth).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'http_401')).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'reauth')).toBe(true);
    expect(status.badges.map((badge) => badge.kind)).toContain('reauth');
  });

  it('does not treat non-quota inspection percentages as weekly quota limits', () => {
    const status = getAuthFileCodexStatus(codexFile(), undefined, {
      fileName: 'codex-main.json',
      authIndex: 'codex-main',
      statusCode: 401,
      action: 'delete',
      usedPercent: 100,
      isQuota: false,
    });

    expect(status.isHttp401).toBe(true);
    expect(status.isWeeklyLimited).toBe(false);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(false);
  });

  it('does not mark legacy quota inspections as monthly-limited without a monthly window', () => {
    const status = getAuthFileCodexStatus(codexFile(), undefined, {
      fileName: 'codex-main.json',
      authIndex: 'codex-main',
      statusCode: 402,
      action: 'disable',
      usedPercent: 100,
      isQuota: true,
    });

    expect(status.isWeeklyLimited).toBe(true);
    expect(status.isMonthlyLimited).toBe(false);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(true);
    expect(authFileMatchesCodexStatusFilter(status, 'monthly_limited')).toBe(false);
  });

  it('ignores non-Codex files for Codex-only status filters', () => {
    const status = getAuthFileCodexStatus({ name: 'qwen.json', type: 'qwen' }, codexQuota());

    expect(status.isCodex).toBe(false);
    expect(status.isWeeklyLimited).toBe(false);
    expect(authFileMatchesCodexStatusFilter(status, 'weekly_limited')).toBe(false);
  });

  it('indexes inspection results by file name and auth index', () => {
    const inspection: AuthFileCodexInspectionSnapshot = {
      fileName: 'codex-main.json',
      authIndex: 'codex-main',
      statusCode: 401,
      action: 'delete',
      usedPercent: null,
      isQuota: false,
    };

    const map = buildAuthFileCodexInspectionMap([inspection]);

    expect(map.get(getAuthFileCodexInspectionKey('codex-main.json', 'codex-main'))).toBe(
      inspection
    );
  });

  it('adds derived Codex status labels to searchable values', () => {
    const status = getAuthFileCodexStatus(codexFile(), undefined, {
      fileName: 'codex-main.json',
      authIndex: 'codex-main',
      statusCode: 401,
      action: 'reauth',
      usedPercent: null,
      isQuota: false,
    });

    expect(
      stringifySearchValue(getAuthFileSearchValues(codexFile(), t, undefined, status))
    ).toContain('auth_files.codex_status_badge_reauth');
    expect(normalizeAuthFilesCodexStatusFilter('http_401')).toBe('reauth');
    expect(normalizeAuthFilesCodexStatusFilter('five_hour_limited')).toBe('five_hour_limited');
    expect(normalizeAuthFilesCodexStatusFilter('monthly_limited')).toBe('monthly_limited');
    expect(normalizeAuthFilesCodexStatusFilter('disabled_with_reset')).toBe('disabled_with_reset');
    expect(normalizeAuthFilesCodexStatusFilter('unknown')).toBeNull();
  });
});

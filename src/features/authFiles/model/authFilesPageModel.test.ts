import { describe, expect, it } from 'vitest';
import type { AntigravityQuotaState, AuthFileItem, CodexQuotaState } from '@/types';
import {
  authFileMatchesCodexStatusFilter,
  authFileMatchesProblemTypeFilter,
  buildAuthFileCodexInspectionMap,
  compareAuthFileDisabledLast,
  compareAuthFileModifiedDesc,
  compareAuthFileName,
  getAuthFileCodexInspectionKey,
  getAuthFileModifiedTime,
  getAuthFileCodexStatus,
  getAuthFilePlanSortRank,
  getAuthFileProblemStatusCode,
  getAuthFileProblemTypeFilter,
  getAuthFileSearchValues,
  normalizeAuthFilesCodexStatusFilter,
  normalizeAuthFilesProblemTypeFilter,
  reconcileStableAuthFileOrder,
  sortAuthFilesWithStableOrder,
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

  it('ranks Antigravity accounts by refreshed tier, highest first', () => {
    const antigravityFile = (name: string): AuthFileItem => ({ name, type: 'antigravity' });
    const rank = (tierId: string | null) =>
      getAuthFilePlanSortRank(antigravityFile(`${tierId}.json`), undefined, {
        status: 'success',
        groups: [],
        tierId,
      });

    expect(rank('g1-ultra-tier')).toBeGreaterThan(rank('g1-pro-tier') ?? 0);
    expect(rank('g1-pro-tier')).toBeGreaterThan(rank('free-tier') ?? 0);
    expect(rank('free-tier')).not.toBeNull();
    expect(rank(null)).toBeNull();
  });

  it('falls back to the server-recorded Antigravity tier before a quota refresh', () => {
    const file: AuthFileItem = {
      name: 'ag.json',
      type: 'antigravity',
      subscription_tier: 'g1-ultra-tier',
    };

    expect(getAuthFilePlanSortRank(file)).toBe(
      getAuthFilePlanSortRank(file, undefined, { status: 'success', groups: [], tierId: 'g1-ultra-tier' })
    );
    expect(
      getAuthFilePlanSortRank(file, undefined, { status: 'success', groups: [], tierId: 'free-tier' })
    ).toBeLessThan(getAuthFilePlanSortRank(file) ?? 0);
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

describe('stable auth file order helpers', () => {
  const createDefaultComparator = (quotaMap: Record<string, AntigravityQuotaState>) => {
    return (left: AuthFileItem, right: AuthFileItem) => {
      const leftRank = getAuthFilePlanSortRank(left, undefined, quotaMap[left.name]);
      const rightRank = getAuthFilePlanSortRank(right, undefined, quotaMap[right.name]);
      const leftKnown = leftRank !== null && leftRank !== undefined;
      const rightKnown = rightRank !== null && rightRank !== undefined;
      if (leftKnown || rightKnown) {
        if (!leftKnown) return 1;
        if (!rightKnown) return -1;
        const rankDiff = rightRank - leftRank;
        if (rankDiff !== 0) return rankDiff;
      }
      return compareAuthFileModifiedDesc(left, right) || compareAuthFileName(left, right);
    };
  };

  it('首次加载按默认比较器排序，并在后续刷新修改时间或套餐后维持原顺序与引用', () => {
    const initialFiles: AuthFileItem[] = [
      { name: 'b.json', type: 'antigravity', modified: 1_000 },
      { name: 'a.json', type: 'antigravity', modified: 3_000, subscription_tier: 'free-tier' },
      { name: 'c.json', type: 'antigravity', modified: 2_000 },
    ];
    const initialOrder = reconcileStableAuthFileOrder(
      null,
      initialFiles,
      createDefaultComparator({})
    );
    expect(initialOrder).toEqual(['a.json', 'c.json', 'b.json']);

    const refreshedFiles: AuthFileItem[] = [
      { name: 'b.json', type: 'antigravity', modified: 9_000 },
      { name: 'a.json', type: 'antigravity', modified: 3_000, subscription_tier: 'free-tier' },
      { name: 'c.json', type: 'antigravity', modified: 5_000 },
    ];
    const afterRefreshOrder = reconcileStableAuthFileOrder(
      initialOrder,
      refreshedFiles,
      createDefaultComparator({
        'b.json': { status: 'success', groups: [], tierId: 'g1-pro-tier' },
      })
    );
    expect(afterRefreshOrder).toBe(initialOrder);

    const lockedMap = new Map((afterRefreshOrder ?? []).map((name, index) => [name, index]));
    const sorted = sortAuthFilesWithStableOrder(
      refreshedFiles,
      createDefaultComparator({
        'b.json': { status: 'success', groups: [], tierId: 'g1-pro-tier' },
      }),
      lockedMap
    );
    expect(sorted.map((item) => item.name)).toEqual(['a.json', 'c.json', 'b.json']);
  });

  it('移除已删除文件并按比较器将新增文件追加到末尾，解除锁定时按新比较器重排', () => {
    const previousOrder = ['a.json', 'c.json', 'b.json'];
    const nextFiles: AuthFileItem[] = [
      { name: 'b.json', type: 'antigravity', modified: 4_000 },
      { name: 'a.json', type: 'antigravity', modified: 1_000 },
      { name: 'd.json', type: 'antigravity', modified: 2_000 },
      { name: 'e.json', type: 'antigravity', modified: 8_000 },
    ];
    const compare = createDefaultComparator({});

    const reconciled = reconcileStableAuthFileOrder(previousOrder, nextFiles, compare);
    expect(reconciled).toEqual(['a.json', 'b.json', 'e.json', 'd.json']);

    const resortedWithoutLock = sortAuthFilesWithStableOrder(nextFiles, compareAuthFileName, null);
    expect(resortedWithoutLock.map((item) => item.name)).toEqual([
      'a.json',
      'b.json',
      'd.json',
      'e.json',
    ]);
  });
});

import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  CodexQuotaWindow,
  GeminiCliQuotaState,
  KimiQuotaState,
  KiroQuotaState,
  XaiBillingSummary,
  XaiQuotaState,
} from '@/types';
import {
  formatKimiResetHint,
  formatQuotaResetTime,
  normalizePlanType,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
} from '@/utils/quota';
import {
  getTypeLabel,
  normalizeProviderKey,
  parsePriorityValue,
  type QuotaProviderType,
} from '@/features/authFiles/constants';

export const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
export const easePower2In = (progress: number) => progress ** 3;
export const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
export const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
export const DEFAULT_REGULAR_PAGE_SIZE = 9;
export const DEFAULT_COMPACT_PAGE_SIZE = 12;

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

const PREMIUM_CODEX_PLAN_TYPES = new Set(['pro', 'prolite', 'pro-lite', 'pro_lite']);
const CODEX_FIVE_HOUR_WINDOW_SECONDS = 18_000;
const CODEX_WEEKLY_WINDOW_SECONDS = 604_800;
const CODEX_MONTHLY_WINDOW_SECONDS = 2_592_000;
const UNKNOWN_AUTH_INDEX_KEY = '-';

export const AUTH_FILES_CODEX_STATUS_FILTERS = [
  'all',
  // Legacy URL/query value. The Auth Files UI now presents 401 as "needs reauth".
  'http_401',
  'reauth',
  'five_hour_limited',
  'weekly_limited',
  'monthly_limited',
  'disabled_with_reset',
] as const;

export const AUTH_FILES_PROBLEM_TYPE_FILTERS = ['all', '400', '401', '403', 'other'] as const;

export type AuthFilesCodexStatusFilter = (typeof AUTH_FILES_CODEX_STATUS_FILTERS)[number];
export type AuthFilesProblemTypeFilter = (typeof AUTH_FILES_PROBLEM_TYPE_FILTERS)[number];
export type AuthFileCodexStatusBadgeTone = 'danger' | 'warning' | 'info';
export type AuthFileCodexStatusBadgeKind =
  | 'reauth'
  | 'five_hour_limited'
  | 'weekly_limited'
  | 'monthly_limited'
  | 'disabled_with_reset';

export type AuthFileCodexStatusBadge = {
  kind: AuthFileCodexStatusBadgeKind;
  tone: AuthFileCodexStatusBadgeTone;
  labelKey: string;
  defaultLabel: string;
  titleKey?: string;
  defaultTitle?: string;
  labelParams?: Record<string, string | number>;
};

export type AuthFileCodexStatusSummary = {
  isCodex: boolean;
  isHttp401: boolean;
  needsReauth: boolean;
  isFiveHourLimited: boolean;
  isWeeklyLimited: boolean;
  isMonthlyLimited: boolean;
  hasDisabledRecoveryReset: boolean;
  fiveHourResetLabel: string | null;
  weeklyResetLabel: string | null;
  monthlyResetLabel: string | null;
  recoveryResetLabel: string | null;
  fiveHourUsedPercent: number | null;
  weeklyUsedPercent: number | null;
  monthlyUsedPercent: number | null;
  badges: AuthFileCodexStatusBadge[];
};

export const getCodexTableQuotaWindows = (
  quota: CodexQuotaState | undefined,
  codexStatus: AuthFileCodexStatusSummary
): CodexQuotaWindow[] => {
  if (quota?.windows.length) return quota.windows;

  return [
    {
      id: 'five-hour',
      label: '',
      labelKey: 'auth_files.table_quota_five_hour',
      usedPercent: codexStatus.fiveHourUsedPercent,
      resetLabel: codexStatus.fiveHourResetLabel ?? '-',
      limitWindowSeconds: CODEX_FIVE_HOUR_WINDOW_SECONDS,
    },
    {
      id: 'weekly',
      label: '',
      labelKey: 'auth_files.table_quota_weekly',
      usedPercent: codexStatus.weeklyUsedPercent,
      resetLabel: codexStatus.weeklyResetLabel ?? '-',
      limitWindowSeconds: CODEX_WEEKLY_WINDOW_SECONDS,
    },
    {
      id: 'monthly',
      label: '',
      labelKey: 'codex_quota.monthly_window',
      usedPercent: codexStatus.monthlyUsedPercent,
      resetLabel: codexStatus.monthlyResetLabel ?? '-',
      limitWindowSeconds: CODEX_MONTHLY_WINDOW_SECONDS,
    },
  ].filter((window) => window.usedPercent !== null || window.resetLabel !== '-');
};

export const formatXaiCurrencyCents = (value: number | null): string => {
  if (value === null) return '--';
  return `$${(value / 100).toFixed(2)}`;
};

/** 列表模式使用：从 xAI 额度状态提取账单摘要（与卡片模式成功态一致）。 */
export const getXaiTableQuotaBilling = (
  quota: XaiQuotaState | undefined
): XaiBillingSummary | null => {
  if (!quota || quota.status !== 'success' || !quota.billing) return null;
  return quota.billing;
};

export type AuthFileTableQuotaDisplayItem = {
  id: string;
  label: string;
  /** 剩余百分比（0-100），进度条使用；meta 行可为 null */
  remainingPercent: number | null;
  /** 次要信息：金额 / 重置时间等 */
  detail: string | null;
  kind: 'progress' | 'meta';
};

const clampRemainingPercent = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
};

const usedPercentToRemaining = (usedPercent: number | null | undefined): number | null => {
  if (usedPercent === null || usedPercent === undefined || !Number.isFinite(usedPercent)) {
    return null;
  }
  return clampRemainingPercent(100 - usedPercent);
};

const formatKiroUnixTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '-';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const formatKiroNumber = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value);
};

const pushMeta = (
  items: AuthFileTableQuotaDisplayItem[],
  id: string,
  label: string,
  detail: string | null
) => {
  if (!detail) return;
  items.push({ id, label, remainingPercent: null, detail, kind: 'meta' });
};

const pushProgress = (
  items: AuthFileTableQuotaDisplayItem[],
  id: string,
  label: string,
  remainingPercent: number | null,
  detail: string | null
) => {
  if (remainingPercent === null && !detail) return;
  items.push({
    id,
    label,
    remainingPercent,
    detail,
    kind: 'progress',
  });
};

/**
 * 将各 provider 成功态额度转成列表模式紧凑展示项（对齐卡片模式核心信息）。
 * codex 可在窗口未加载时回退到状态摘要。
 */
export const buildAuthFileTableQuotaItems = (
  quotaType: string | null,
  quota: unknown,
  t: TFunction,
  options?: { codexStatus?: AuthFileCodexStatusSummary }
): AuthFileTableQuotaDisplayItem[] => {
  if (!quotaType) return [];

  if (quotaType === 'codex') {
    const windows = getCodexTableQuotaWindows(
      quota as CodexQuotaState | undefined,
      options?.codexStatus ?? {
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
      }
    );
    return windows.map((window) => ({
      id: window.id,
      label: window.labelKey ? t(window.labelKey, window.labelParams) : window.label,
      remainingPercent: usedPercentToRemaining(window.usedPercent),
      detail: window.resetLabel && window.resetLabel !== '-' ? window.resetLabel : null,
      kind: 'progress' as const,
    }));
  }

  if (!quota || typeof quota !== 'object') return [];
  const status = (quota as { status?: string }).status;
  if (status !== 'success') return [];

  const items: AuthFileTableQuotaDisplayItem[] = [];

  if (quotaType === 'xai') {
    const billing = getXaiTableQuotaBilling(quota as XaiQuotaState);
    if (!billing) return [];
    const amountLabel = t('xai_quota.usage_amount', {
      used: formatXaiCurrencyCents(billing.usedCents),
      limit: formatXaiCurrencyCents(billing.monthlyLimitCents),
    });
    const resetLabel = billing.billingPeriodEnd
      ? formatQuotaResetTime(billing.billingPeriodEnd)
      : t('xai_quota.reset_unknown');
    pushProgress(
      items,
      'monthly',
      t('xai_quota.monthly_limit'),
      usedPercentToRemaining(billing.usedPercent),
      `${amountLabel} · ${resetLabel}`
    );
    if (billing.onDemandCapCents !== null) {
      pushMeta(
        items,
        'on-demand-cap',
        t('xai_quota.on_demand_cap'),
        formatXaiCurrencyCents(billing.onDemandCapCents)
      );
    }
    return items;
  }

  if (quotaType === 'claude') {
    const claude = quota as ClaudeQuotaState;
    if (claude.planType) {
      pushMeta(items, 'plan', t('claude_quota.plan_label'), t(`claude_quota.${claude.planType}`));
    }
    if (claude.extraUsage?.is_enabled) {
      const usedLabel = `$${(claude.extraUsage.used_credits / 100).toFixed(2)} / $${(
        claude.extraUsage.monthly_limit / 100
      ).toFixed(2)}`;
      pushMeta(items, 'extra', t('claude_quota.extra_usage_label'), usedLabel);
    }
    for (const window of claude.windows ?? []) {
      pushProgress(
        items,
        window.id,
        window.labelKey ? t(window.labelKey) : window.label,
        usedPercentToRemaining(window.usedPercent),
        window.resetLabel || null
      );
    }
    return items;
  }

  if (quotaType === 'antigravity') {
    const anti = quota as AntigravityQuotaState;
    for (const group of anti.groups ?? []) {
      const remaining = clampRemainingPercent(Math.round(Math.max(0, Math.min(1, group.remainingFraction)) * 100));
      pushProgress(
        items,
        group.id,
        group.label,
        remaining,
        group.resetTime ? formatQuotaResetTime(group.resetTime) : null
      );
    }
    if (anti.creditBalance !== null && anti.creditBalance !== undefined) {
      pushMeta(
        items,
        'credits',
        t('antigravity_quota.credit_label'),
        t('antigravity_quota.credit_amount', { count: anti.creditBalance })
      );
    }
    return items;
  }

  if (quotaType === 'gemini-cli') {
    const gemini = quota as GeminiCliQuotaState;
    if (gemini.tierLabel) {
      pushMeta(items, 'tier', t('gemini_cli_quota.tier_label'), gemini.tierLabel);
    }
    if (gemini.creditBalance !== null && gemini.creditBalance !== undefined) {
      pushMeta(
        items,
        'credits',
        t('gemini_cli_quota.credit_label'),
        t('gemini_cli_quota.credit_amount', { count: gemini.creditBalance })
      );
    }
    for (const bucket of gemini.buckets ?? []) {
      const remaining =
        bucket.remainingFraction === null
          ? null
          : clampRemainingPercent(Math.round(Math.max(0, Math.min(1, bucket.remainingFraction)) * 100));
      const amount =
        bucket.remainingAmount === null || bucket.remainingAmount === undefined
          ? null
          : t('gemini_cli_quota.remaining_amount', { count: bucket.remainingAmount });
      const reset = bucket.resetTime ? formatQuotaResetTime(bucket.resetTime) : null;
      const detail = [amount, reset].filter(Boolean).join(' · ') || null;
      pushProgress(items, bucket.id, bucket.label, remaining, detail);
    }
    return items;
  }

  if (quotaType === 'kimi') {
    const kimi = quota as KimiQuotaState;
    for (const row of kimi.rows ?? []) {
      const remaining =
        row.limit > 0
          ? clampRemainingPercent(Math.round(((row.limit - row.used) / row.limit) * 100))
          : row.used > 0
            ? 0
            : null;
      const rowLabel = row.labelKey
        ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
        : (row.label ?? '');
      const amount = row.limit > 0 ? `${row.used} / ${row.limit}` : null;
      const reset = formatKimiResetHint(t, row.resetHint) || null;
      const detail = [amount, reset].filter(Boolean).join(' · ') || null;
      pushProgress(items, row.id, rowLabel, remaining, detail);
    }
    return items;
  }

  if (quotaType === 'kiro') {
    const kiro = quota as KiroQuotaState;
    if (kiro.subscriptionTitle) {
      pushMeta(items, 'subscription', t('kiro_quota.subscription_label'), kiro.subscriptionTitle);
    }
    if (kiro.overageStatus) {
      const enabled = kiro.overageStatus.toUpperCase() === 'ENABLED';
      pushMeta(
        items,
        'overage-status',
        t('kiro_quota.overage_status'),
        enabled ? t('kiro_quota.overage_enabled') : t('kiro_quota.overage_disabled')
      );
    }
    if (kiro.overageQuota) {
      const overage = kiro.overageQuota;
      const unitLabel =
        overage.unitLabel && !/^credits?$/i.test(overage.unitLabel)
          ? overage.unitLabel
          : t('kiro_quota.overage_unit');
      const used = Math.max(0, overage.currentOverages ?? 0);
      const cap = Math.max(0, overage.cap ?? 0);
      const remaining = Math.max(0, cap - used);
      const remainingPercent =
        cap > 0 ? clampRemainingPercent(Math.round((remaining / cap) * 100)) : null;
      const amountLabel =
        overage.currentOverages === null && overage.cap === null
          ? '-'
          : `${formatKiroNumber(remaining)} / ${cap > 0 ? formatKiroNumber(cap, 0) : '-'} ${unitLabel}`;
      pushProgress(items, 'overage-usage', t('kiro_quota.overage_usage'), remainingPercent, amountLabel);
    }
    if (kiro.baseQuota) {
      const { used, limit, resetTime } = kiro.baseQuota;
      const remaining = Math.max(0, limit - used);
      const percent = limit > 0 ? clampRemainingPercent(Math.round((remaining / limit) * 100)) : 0;
      pushProgress(
        items,
        'base',
        t('kiro_quota.base_quota'),
        percent,
        `${remaining.toFixed(1)}/${limit} · ${formatKiroUnixTime(resetTime)}`
      );
    }
    if (kiro.freeTrialQuota) {
      const { used, limit, expiry, status: trialStatus } = kiro.freeTrialQuota;
      const remaining = Math.max(0, limit - used);
      const percent = limit > 0 ? clampRemainingPercent(Math.round((remaining / limit) * 100)) : 0;
      const isActive = trialStatus.toUpperCase() === 'ACTIVE';
      const statusLabel = isActive ? t('kiro_quota.trial_active') : t('kiro_quota.trial_expired');
      pushProgress(
        items,
        'trial',
        `${t('kiro_quota.free_trial')} (${statusLabel})`,
        percent,
        `${remaining.toFixed(1)}/${limit} · ${formatKiroUnixTime(expiry)}`
      );
    }
    return items;
  }

  return items;
};

/** 兼容旧列表模式的额度项结构；新表格统一使用 buildAuthFileTableQuotaItems。 */
export type AuthFileTableQuotaItem = {
  id: string;
  label: string;
  percent: number | null;
  resetLabel: string;
  detailLabel?: string | null;
};

export const getAntigravityTableQuotaItems = (
  quota: AntigravityQuotaState | undefined
): AuthFileTableQuotaItem[] =>
  (quota?.groups ?? []).map((group) => ({
    id: group.id,
    label: group.label,
    percent: Math.round(Math.max(0, Math.min(1, group.remainingFraction)) * 100),
    resetLabel: formatQuotaResetTime(group.resetTime),
  }));

export const getAuthFileTableQuotaItems = (
  quotaType: Exclude<QuotaProviderType, 'codex'>,
  quota: unknown,
  t: TFunction
): AuthFileTableQuotaItem[] => {
  if (quotaType === 'antigravity') {
    return getAntigravityTableQuotaItems(quota as AntigravityQuotaState | undefined);
  }

  if (quotaType === 'claude') {
    return ((quota as ClaudeQuotaState | undefined)?.windows ?? []).map((window) => ({
      id: window.id,
      label: window.labelKey ? t(window.labelKey) : window.label,
      percent: usedPercentToRemaining(window.usedPercent),
      resetLabel: window.resetLabel,
    }));
  }

  if (quotaType === 'gemini-cli') {
    return ((quota as GeminiCliQuotaState | undefined)?.buckets ?? []).map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      percent:
        bucket.remainingFraction === null
          ? null
          : clampRemainingPercent(bucket.remainingFraction * 100),
      resetLabel: formatQuotaResetTime(bucket.resetTime),
      detailLabel:
        bucket.remainingAmount === null || bucket.remainingAmount === undefined
          ? null
          : t('gemini_cli_quota.remaining_amount', { count: bucket.remainingAmount }),
    }));
  }

  if (quotaType === 'kimi') {
    return ((quota as KimiQuotaState | undefined)?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.labelKey
        ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
        : (row.label ?? ''),
      percent:
        row.limit > 0
          ? clampRemainingPercent(((row.limit - row.used) / row.limit) * 100)
          : row.used > 0
            ? 0
            : null,
      resetLabel: formatKimiResetHint(t, row.resetHint) || '-',
      detailLabel: row.limit > 0 ? `${row.used} / ${row.limit}` : null,
    }));
  }

  if (quotaType === 'kiro') {
    const kiro = quota as KiroQuotaState | undefined;
    const items: AuthFileTableQuotaItem[] = [];
    if (kiro?.overageQuota) {
      const used = Math.max(0, kiro.overageQuota.currentOverages ?? 0);
      const limit = Math.max(0, kiro.overageQuota.cap ?? 0);
      const remaining = Math.max(0, limit - used);
      items.push({
        id: 'overage-usage',
        label: t('kiro_quota.overage_usage'),
        percent: limit > 0 ? clampRemainingPercent((remaining / limit) * 100) : null,
        resetLabel: '-',
        detailLabel: `${remaining.toFixed(1)} / ${limit || '-'}`,
      });
    }
    if (kiro?.baseQuota) {
      const remaining = Math.max(0, kiro.baseQuota.limit - kiro.baseQuota.used);
      items.push({
        id: 'base',
        label: t('kiro_quota.base_quota'),
        percent:
          kiro.baseQuota.limit > 0
            ? clampRemainingPercent((remaining / kiro.baseQuota.limit) * 100)
            : 0,
        resetLabel: formatKiroUnixTime(kiro.baseQuota.resetTime),
        detailLabel: `${remaining.toFixed(1)} / ${kiro.baseQuota.limit}`,
      });
    }
    if (kiro?.freeTrialQuota) {
      const remaining = Math.max(0, kiro.freeTrialQuota.limit - kiro.freeTrialQuota.used);
      const active = kiro.freeTrialQuota.status.toUpperCase() === 'ACTIVE';
      items.push({
        id: 'trial',
        label: `${t('kiro_quota.free_trial')} (${t(
          active ? 'kiro_quota.trial_active' : 'kiro_quota.trial_expired'
        )})`,
        percent:
          kiro.freeTrialQuota.limit > 0
            ? clampRemainingPercent((remaining / kiro.freeTrialQuota.limit) * 100)
            : 0,
        resetLabel: formatKiroUnixTime(kiro.freeTrialQuota.expiry),
        detailLabel: `${remaining.toFixed(1)} / ${kiro.freeTrialQuota.limit}`,
      });
    }
    return items;
  }

  const billing = (quota as XaiQuotaState | undefined)?.billing;
  if (!billing) return [];
  return [
    {
      id: 'monthly-limit',
      label: t('xai_quota.monthly_limit'),
      percent: usedPercentToRemaining(billing.usedPercent),
      resetLabel: billing.billingPeriodEnd
        ? formatQuotaResetTime(billing.billingPeriodEnd)
        : t('xai_quota.reset_unknown'),
      detailLabel: t('xai_quota.usage_amount', {
        used: formatXaiCurrencyCents(billing.usedCents),
        limit: formatXaiCurrencyCents(billing.monthlyLimitCents),
      }),
    },
  ];
};

export type AuthFileCodexInspectionSnapshot = {
  fileName: string;
  authIndex?: string | number | null;
  statusCode?: number | string | null;
  action?: string | null;
  usedPercent?: number | string | null;
  isQuota?: boolean | null;
};

const CODEX_STATUS_FILTER_SET = new Set<AuthFilesCodexStatusFilter>(
  AUTH_FILES_CODEX_STATUS_FILTERS
);
const PROBLEM_TYPE_FILTER_SET = new Set<AuthFilesProblemTypeFilter>(
  AUTH_FILES_PROBLEM_TYPE_FILTERS
);

export const compareAuthFileName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

export const compareAuthFileDisabledLast = (left: AuthFileItem, right: AuthFileItem) => {
  const leftDisabled = left.disabled === true;
  const rightDisabled = right.disabled === true;
  if (leftDisabled === rightDisabled) return 0;
  return leftDisabled ? 1 : -1;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** 读取认证文件修改时间（毫秒时间戳优先；无效值返回 null） */
export const getAuthFileModifiedTime = (file: AuthFileItem): number | null => {
  const raw = file.modified ?? file['modified'];
  return normalizeNumber(raw);
};

/** 修改时间新的在前；缺失修改时间的项靠后 */
export const compareAuthFileModifiedDesc = (left: AuthFileItem, right: AuthFileItem) => {
  const leftTime = getAuthFileModifiedTime(left);
  const rightTime = getAuthFileModifiedTime(right);
  const leftKnown = leftTime !== null;
  const rightKnown = rightTime !== null;

  if (leftKnown || rightKnown) {
    if (!leftKnown) return 1;
    if (!rightKnown) return -1;
    const diff = rightTime - leftTime;
    if (diff !== 0) return diff;
  }

  return 0;
};

const normalizeAuthIndexKey = (value: unknown): string => {
  if (value === undefined || value === null) return UNKNOWN_AUTH_INDEX_KEY;
  const normalized = String(value).trim();
  return normalized || UNKNOWN_AUTH_INDEX_KEY;
};

const isCodexAuthFile = (file: AuthFileItem): boolean =>
  normalizeProviderKey(String(file.type ?? file.provider ?? '')) === 'codex';

const isKnownResetLabel = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '-';
};

const normalizeWindowSeconds = (value: unknown): number | null => normalizeNumber(value);

const findCodexQuotaWindow = (
  quota: CodexQuotaState | undefined,
  preferredMatch: (window: CodexQuotaState['windows'][number]) => boolean,
  limitWindowSeconds: number
) => {
  const windows = quota?.windows ?? [];
  return (
    windows.find(preferredMatch) ??
    windows.find((window) => normalizeWindowSeconds(window.limitWindowSeconds) === limitWindowSeconds) ??
    null
  );
};

const findCodexFiveHourQuotaWindow = (quota?: CodexQuotaState) =>
  findCodexQuotaWindow(
    quota,
    (window) => window.id === 'five-hour' || window.labelKey === 'codex_quota.primary_window',
    CODEX_FIVE_HOUR_WINDOW_SECONDS
  );

const findCodexWeeklyQuotaWindow = (quota?: CodexQuotaState) =>
  findCodexQuotaWindow(
    quota,
    (window) => window.id === 'weekly' || window.labelKey === 'codex_quota.secondary_window',
    CODEX_WEEKLY_WINDOW_SECONDS
  );

const findCodexMonthlyQuotaWindow = (quota?: CodexQuotaState) =>
  findCodexQuotaWindow(
    quota,
    (window) => window.id === 'monthly' || window.labelKey === 'codex_quota.monthly_window',
    CODEX_MONTHLY_WINDOW_SECONDS
  );

export const normalizeAuthFilesCodexStatusFilter = (
  value: unknown
): AuthFilesCodexStatusFilter | null => {
  if (value === 'http_401') return 'reauth';
  return CODEX_STATUS_FILTER_SET.has(value as AuthFilesCodexStatusFilter)
    ? (value as AuthFilesCodexStatusFilter)
    : null;
};

export const normalizeAuthFilesProblemTypeFilter = (
  value: unknown
): AuthFilesProblemTypeFilter | null =>
  PROBLEM_TYPE_FILTER_SET.has(value as AuthFilesProblemTypeFilter)
    ? (value as AuthFilesProblemTypeFilter)
    : null;

export const getAuthFileProblemStatusCode = (file: AuthFileItem): number | null => {
  const statusCode = normalizeNumber(
    file.errorStatus ?? file['error_status'] ?? file.statusCode ?? file['status_code']
  );
  if (statusCode === null) return null;
  return Math.trunc(statusCode);
};

export const getAuthFileProblemTypeFilter = (file: AuthFileItem): AuthFilesProblemTypeFilter => {
  const statusCode = getAuthFileProblemStatusCode(file);
  if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
    return String(statusCode) as AuthFilesProblemTypeFilter;
  }
  return 'other';
};

export const authFileMatchesProblemTypeFilter = (
  file: AuthFileItem,
  filter: AuthFilesProblemTypeFilter
): boolean => filter === 'all' || getAuthFileProblemTypeFilter(file) === filter;

export const getAuthFileCodexInspectionKey = (fileName: string, authIndex?: unknown) =>
  `${fileName}::${normalizeAuthIndexKey(authIndex)}`;

export const getAuthFileCodexInspectionKeyForFile = (file: AuthFileItem) =>
  getAuthFileCodexInspectionKey(file.name, file.authIndex ?? file['auth_index']);

export const buildAuthFileCodexInspectionMap = (
  items: AuthFileCodexInspectionSnapshot[]
): Map<string, AuthFileCodexInspectionSnapshot> => {
  const map = new Map<string, AuthFileCodexInspectionSnapshot>();
  items.forEach((item) => {
    if (!item.fileName) return;
    map.set(getAuthFileCodexInspectionKey(item.fileName, item.authIndex), item);
  });
  return map;
};

export const getAuthFileCodexStatus = (
  file: AuthFileItem,
  quota?: CodexQuotaState,
  inspection?: AuthFileCodexInspectionSnapshot
): AuthFileCodexStatusSummary => {
  const isCodex = isCodexAuthFile(file);
  if (!isCodex) {
    return {
      isCodex: false,
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
    };
  }

  const fiveHourWindow = findCodexFiveHourQuotaWindow(quota);
  const weeklyWindow = findCodexWeeklyQuotaWindow(quota);
  const monthlyWindow = findCodexMonthlyQuotaWindow(quota);
  const fiveHourUsedPercent = normalizeNumber(fiveHourWindow?.usedPercent);
  const weeklyWindowUsedPercent = normalizeNumber(weeklyWindow?.usedPercent);
  const monthlyWindowUsedPercent = normalizeNumber(monthlyWindow?.usedPercent);
  const inspectionUsedPercent =
    inspection?.isQuota === true ? normalizeNumber(inspection?.usedPercent) : null;
  const monthlyUsedPercent =
    monthlyWindowUsedPercent ?? (monthlyWindow ? inspectionUsedPercent : null);
  const longWindowUsedPercent = weeklyWindowUsedPercent ?? monthlyUsedPercent;
  const weeklyUsedPercent =
    weeklyWindowUsedPercent ?? (!monthlyWindow ? inspectionUsedPercent : null);
  const fiveHourResetLabel = isKnownResetLabel(fiveHourWindow?.resetLabel)
    ? fiveHourWindow.resetLabel.trim()
    : null;
  const weeklyResetLabel = isKnownResetLabel(weeklyWindow?.resetLabel)
    ? weeklyWindow.resetLabel.trim()
    : null;
  const monthlyResetLabel = isKnownResetLabel(monthlyWindow?.resetLabel)
    ? monthlyWindow.resetLabel.trim()
    : null;
  const statusCode =
    normalizeNumber(inspection?.statusCode) ??
    normalizeNumber(
      file.errorStatus ?? file['error_status'] ?? file.statusCode ?? file['status_code']
    ) ??
    normalizeNumber(quota?.errorStatus);
  const action = typeof inspection?.action === 'string' ? inspection.action : '';
  const isHttp401 = statusCode === 401;
  const needsReauth = action === 'reauth' || isHttp401;
  const inspectionReachedQuota =
    inspection?.isQuota === true &&
    (action === 'disable' ||
      (longWindowUsedPercent !== null && longWindowUsedPercent >= 100) ||
      (file.disabled === true && action === 'keep'));
  const isWeeklyLimited =
    (weeklyUsedPercent !== null && weeklyUsedPercent >= 100) ||
    (inspectionReachedQuota && !monthlyWindow);
  const isMonthlyLimited =
    (monthlyUsedPercent !== null && monthlyUsedPercent >= 100) ||
    (inspectionReachedQuota && monthlyWindow !== null && !weeklyWindow);
  const isFiveHourLimited = fiveHourUsedPercent !== null && fiveHourUsedPercent >= 100;
  const recoveryResetLabel =
    (isMonthlyLimited && monthlyResetLabel) ||
    (isWeeklyLimited && weeklyResetLabel) ||
    (isFiveHourLimited && fiveHourResetLabel) ||
    null;
  const hasDisabledRecoveryReset = file.disabled === true && recoveryResetLabel !== null;
  const badges: AuthFileCodexStatusBadge[] = [];

  if (needsReauth) {
    badges.push({
      kind: 'reauth',
      tone: 'danger',
      labelKey: 'auth_files.codex_status_badge_reauth',
      defaultLabel: 'Needs reauth',
      titleKey: 'auth_files.codex_status_badge_reauth_title',
      defaultTitle: 'Latest Codex check returned 401 or suggested reauthorization.',
    });
  }

  if (isFiveHourLimited) {
    badges.push({
      kind: 'five_hour_limited',
      tone: 'warning',
      labelKey: 'auth_files.codex_status_badge_five_hour_limited',
      defaultLabel: '5h quota full',
      titleKey: 'auth_files.codex_status_badge_five_hour_limited_title',
      defaultTitle: 'The Codex 5-hour quota window is at or above the limit.',
    });
  }

  if (isWeeklyLimited) {
    badges.push({
      kind: 'weekly_limited',
      tone: 'warning',
      labelKey: 'auth_files.codex_status_badge_weekly_limited',
      defaultLabel: '7d quota full',
      titleKey: 'auth_files.codex_status_badge_weekly_limited_title',
      defaultTitle: 'The Codex 7-day quota window is at or above the limit.',
    });
  }

  if (isMonthlyLimited) {
    badges.push({
      kind: 'monthly_limited',
      tone: 'warning',
      labelKey: 'auth_files.codex_status_badge_monthly_limited',
      defaultLabel: 'Monthly quota full',
      titleKey: 'auth_files.codex_status_badge_monthly_limited_title',
      defaultTitle: 'The Codex monthly quota window is at or above the limit.',
    });
  }

  if (hasDisabledRecoveryReset && recoveryResetLabel) {
    badges.push({
      kind: 'disabled_with_reset',
      tone: 'info',
      labelKey: 'auth_files.codex_status_badge_disabled_reset',
      defaultLabel: `Restores ${recoveryResetLabel}`,
      titleKey: 'auth_files.codex_status_badge_disabled_reset_title',
      defaultTitle: `This disabled Codex account has a known quota recovery time: ${recoveryResetLabel}`,
      labelParams: { reset: recoveryResetLabel },
    });
  }

  return {
    isCodex,
    isHttp401,
    needsReauth,
    isFiveHourLimited,
    isWeeklyLimited,
    isMonthlyLimited,
    hasDisabledRecoveryReset,
    fiveHourResetLabel,
    weeklyResetLabel,
    monthlyResetLabel,
    recoveryResetLabel,
    fiveHourUsedPercent,
    weeklyUsedPercent,
    monthlyUsedPercent,
    badges,
  };
};

export const authFileMatchesCodexStatusFilter = (
  status: AuthFileCodexStatusSummary,
  filter: AuthFilesCodexStatusFilter
): boolean => {
  if (filter === 'all') return true;
  if (!status.isCodex) return false;
  if (filter === 'http_401') return status.isHttp401;
  if (filter === 'reauth') return status.needsReauth || status.isHttp401;
  if (filter === 'five_hour_limited') return status.isFiveHourLimited;
  if (filter === 'weekly_limited') return status.isWeeklyLimited;
  if (filter === 'monthly_limited') return status.isMonthlyLimited;
  if (filter === 'disabled_with_reset') return status.hasDisabledRecoveryReset;
  return true;
};

const getAuthFileCodexStatusSearchValues = (
  status: AuthFileCodexStatusSummary | undefined,
  t: TFunction
) =>
  status?.badges.flatMap((badge) => [
    badge.kind,
    badge.labelKey,
    badge.defaultLabel,
    t(badge.labelKey, { defaultValue: badge.defaultLabel, ...badge.labelParams }),
    badge.defaultTitle,
    badge.titleKey
      ? t(badge.titleKey, { defaultValue: badge.defaultTitle ?? badge.defaultLabel })
      : null,
  ]) ?? [];

const getAuthFileNoteValue = (file: AuthFileItem): string => {
  const raw = file.note ?? file['note'];
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

export const compareAuthFileNote = (
  left: AuthFileItem,
  right: AuthFileItem,
  direction: 'asc' | 'desc'
) => {
  const leftNote = getAuthFileNoteValue(left);
  const rightNote = getAuthFileNoteValue(right);
  const leftKnown = leftNote.length > 0;
  const rightKnown = rightNote.length > 0;

  if (leftKnown || rightKnown) {
    if (!leftKnown) return 1;
    if (!rightKnown) return -1;
    const diff = leftNote.localeCompare(rightNote, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (diff !== 0) return direction === 'asc' ? diff : -diff;
  }

  return compareAuthFileName(left, right);
};

export const compareAuthFilePriority = (
  left: AuthFileItem,
  right: AuthFileItem,
  direction: 'asc' | 'desc'
) => {
  const leftPriority = parsePriorityValue(left.priority ?? left['priority']);
  const rightPriority = parsePriorityValue(right.priority ?? right['priority']);
  const leftKnown = leftPriority !== undefined;
  const rightKnown = rightPriority !== undefined;

  if (leftKnown || rightKnown) {
    if (!leftKnown) return 1;
    if (!rightKnown) return -1;
    const leftValue = leftPriority ?? 0;
    const rightValue = rightPriority ?? 0;
    const diff = direction === 'desc' ? rightValue - leftValue : leftValue - rightValue;
    if (diff !== 0) return diff;
  }

  return compareAuthFileName(left, right);
};

export const stringifySearchValue = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(stringifySearchValue);
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return [];
};

export const getAuthFileCodexPlanLabel = (
  planType: string | null | undefined,
  t: TFunction
): string | null => {
  const normalized = normalizePlanType(planType);
  if (!normalized) return null;
  if (normalized === 'pro') return t('codex_quota.plan_pro');
  if (PREMIUM_CODEX_PLAN_TYPES.has(normalized) && normalized !== 'pro') {
    return t('codex_quota.plan_prolite');
  }
  if (normalized === 'plus') return t('codex_quota.plan_plus');
  if (normalized === 'team') return t('codex_quota.plan_team');
  if (normalized === 'free') return t('codex_quota.plan_free');
  return planType || normalized;
};

export const getAuthFilePlanType = (
  file: AuthFileItem,
  quota?: CodexQuotaState
): string | null => quota?.planType ?? resolveCodexPlanType(file) ?? null;

export const getAuthFilePlanLabel = (
  file: AuthFileItem,
  t: TFunction,
  quota?: CodexQuotaState
): string | null => getAuthFileCodexPlanLabel(getAuthFilePlanType(file, quota), t);

export const getAuthFilePlanSortRank = (
  file: AuthFileItem,
  quota?: CodexQuotaState
): number | null => {
  const normalized = normalizePlanType(getAuthFilePlanType(file, quota));
  if (!normalized) return null;
  if (normalized === 'pro') return 50;
  if (PREMIUM_CODEX_PLAN_TYPES.has(normalized) && normalized !== 'pro') return 40;
  if (normalized === 'team') return 30;
  if (normalized === 'plus') return 20;
  if (normalized === 'free') return 10;
  return 0;
};

export const getAuthFileSearchValues = (
  file: AuthFileItem,
  t: TFunction,
  quota?: CodexQuotaState,
  codexStatus?: AuthFileCodexStatusSummary
) => {
  const planType = getAuthFilePlanType(file, quota);
  const planLabel = getAuthFileCodexPlanLabel(planType, t);
  const accountId = resolveCodexChatgptAccountId(file);
  const type = file.type || file.provider;

  return [
    file.name,
    file.type,
    file.provider,
    type ? getTypeLabel(t, String(type)) : null,
    file.authIndex,
    file['auth_index'],
    file.status,
    file.state,
    file.statusMessage,
    file['status_message'],
    file.error,
    file.errorStatus,
    file['error_status'],
    quota?.status,
    quota?.error,
    quota?.errorStatus,
    planType,
    planLabel,
    accountId,
    getAuthFileCodexStatusSearchValues(codexStatus, t),
  ];
};

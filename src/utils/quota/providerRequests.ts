import type { TFunction } from 'i18next';
import type {
  AntigravityModelsPayload,
  AntigravityQuotaGroup,
  AuthFileItem,
  ClaudeExtraUsage,
  ClaudeProfileResponse,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexRateLimitResetCredit,
  CodexQuotaWindow,
  CodexUsagePayload,
  GeminiCliCodeAssistPayload,
  GeminiCliCredits,
  GeminiCliParsedBucket,
  GeminiCliQuotaBucketState,
  GeminiCliUserTier,
  KiroBaseQuota,
  KiroFreeTrialQuota,
  KiroOverageQuota,
  KiroQuotaPayload,
  KimiQuotaRow,
  XaiBillingConfig,
  XaiBillingSummary,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api/apiCall';
import { authFilesApi } from '@/services/api/authFiles';
import {
  ANTIGRAVITY_CODE_ASSIST_URLS,
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CLAUDE_PROFILE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_URL,
  CLAUDE_USAGE_WINDOW_KEYS,
  CODEX_RATE_LIMIT_RESET_CREDITS_URL,
  CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
  CODEX_REQUEST_HEADERS,
  CODEX_USAGE_URL,
  GEMINI_CLI_CODE_ASSIST_URL,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  KIMI_REQUEST_HEADERS,
  KIMI_USAGE_URL,
  XAI_BILLING_URL,
  XAI_CREDITS_BILLING_URL,
  XAI_REQUEST_HEADERS,
  XAI_USER_URL,
} from './constants';
import {
  buildAntigravityQuotaGroups,
  buildGeminiCliQuotaBuckets,
  buildKimiQuotaRows,
} from './builders';
import { createStatusError, formatQuotaResetTime, getStatusFromError } from './formatters';
import {
  normalizeAuthIndex,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizePlanType,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseGeminiCliCodeAssistPayload,
  parseGeminiCliQuotaPayload,
  parseKimiUsagePayload,
  parseXaiBillingPayload,
} from './parsers';
import {
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  resolveGeminiCliProjectId,
} from './resolvers';
import { buildCodexQuotaWindowInfos } from './codexQuota';

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn';
const ANTIGRAVITY_G1_CREDIT_TYPE = 'GOOGLE_ONE_AI';
const GEMINI_CLI_G1_CREDIT_TYPE = 'GOOGLE_ONE_AI';

const GEMINI_CLI_TIER_LABELS: Record<string, string> = {
  'free-tier': 'tier_free',
  'legacy-tier': 'tier_legacy',
  'standard-tier': 'tier_standard',
  'g1-pro-tier': 'tier_pro',
  'g1-ultra-tier': 'tier_ultra',
};

export type CodexQuotaData = {
  planType: string | null;
  rateLimitResetCreditsAvailableCount?: number | null;
  rateLimitResetCredits: CodexRateLimitResetCredit[];
  rateLimitResetCreditsError: string;
  windows: CodexQuotaWindow[];
};

export type KiroQuotaData = {
  subscriptionTitle: string | null;
  baseQuota: KiroBaseQuota | null;
  freeTrialQuota: KiroFreeTrialQuota | null;
  overageQuota: KiroOverageQuota | null;
  overageStatus: string | null;
};

export type ClaudeQuotaData = {
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
};

export type GeminiCliQuotaBucketsData = {
  authIndex: string;
  projectId: string;
  buckets: GeminiCliQuotaBucketState[];
};

export type GeminiCliSupplementaryQuota = {
  tierLabel: string | null;
  tierId: string | null;
  creditBalance: number | null;
};

export type AntigravityQuotaData = {
  groups: AntigravityQuotaGroup[];
  creditBalance: number | null;
};

export const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevel = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) return topLevel;

    const installed =
      parsed.installed && typeof parsed.installed === 'object' && parsed.installed !== null
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const installedProjectId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedProjectId) return installedProjectId;

    const web =
      parsed.web && typeof parsed.web === 'object' && parsed.web !== null
        ? (parsed.web as Record<string, unknown>)
        : null;
    const webProjectId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webProjectId) return webProjectId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }

  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

export const fetchAntigravityQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<AntigravityQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('antigravity_quota.missing_auth_index'));
  }

  const projectId = await resolveAntigravityProjectId(file);
  const requestBody = JSON.stringify({ project: projectId });
  const creditBalancePromise = fetchAntigravityCreditBalance(authIndex);

  let lastError = '';
  let lastStatus: number | undefined;
  let priorityStatus: number | undefined;
  let hadSuccess = false;

  for (const url of ANTIGRAVITY_QUOTA_URLS) {
    try {
      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      const payload = parseAntigravityPayload(result.body ?? result.bodyText);
      const models = payload?.models;
      if (!models || typeof models !== 'object' || Array.isArray(models)) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      const groups = buildAntigravityQuotaGroups(models as AntigravityModelsPayload);
      if (groups.length === 0) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      return { groups, creditBalance: await creditBalancePromise };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      if (status) {
        lastStatus = status;
        if (status === 403 || status === 404) {
          priorityStatus ??= status;
        }
      }
    }
  }

  if (hadSuccess) {
    return { groups: [], creditBalance: await creditBalancePromise };
  }

  throw createStatusError(lastError || t('common.unknown_error'), priorityStatus ?? lastStatus, {
    upstream: true,
  });
};

const fetchAntigravityCreditBalance = async (authIndex: string): Promise<number | null> => {
  const requestBody = JSON.stringify({
    metadata: {
      ideName: 'antigravity',
      ideType: 'ANTIGRAVITY',
      ideVersion: '1.23.2',
      platform: 'DARWIN_ARM64',
      pluginType: 'GEMINI',
      pluginVersion: '0.22.17',
      updateChannel: 'stable',
    },
    mode: 'FULL_ELIGIBILITY_CHECK',
  });

  for (const url of ANTIGRAVITY_CODE_ASSIST_URLS) {
    try {
      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        continue;
      }

      const payload = parseGeminiCliCodeAssistPayload(result.body ?? result.bodyText);
      const balance = resolveAntigravityCreditBalance(payload);
      if (balance !== null) return balance;
    } catch {
      continue;
    }
  }

  return null;
};

const resolveAntigravityCreditBalance = (
  payload: GeminiCliCodeAssistPayload | null
): number | null => {
  if (!payload) return null;
  const tiers = [
    payload.paidTier ?? payload.paid_tier ?? null,
    payload.currentTier ?? payload.current_tier ?? null,
  ];

  for (const tier of tiers) {
    if (!tier) continue;
    const credits = tier.availableCredits ?? tier.available_credits ?? [];
    let total = 0;
    let found = false;
    for (const credit of credits) {
      const creditType = normalizeStringValue(credit.creditType ?? credit.credit_type);
      if (creditType !== ANTIGRAVITY_G1_CREDIT_TYPE) continue;
      const amount = normalizeNumberValue(credit.creditAmount ?? credit.credit_amount);
      if (amount === null) continue;
      total += amount;
      found = true;
    }
    if (found) return total;
  }

  return null;
};

export const buildCodexQuotaWindows = (
  payload: CodexUsagePayload,
  t: TFunction
): CodexQuotaWindow[] =>
  buildCodexQuotaWindowInfos(payload).map((window) => ({
    id: window.id,
    label: t(window.labelKey, window.labelParams),
    labelKey: window.labelKey,
    labelParams: window.labelParams,
    usedPercent: window.usedPercent,
    resetLabel: window.resetLabel,
    limitWindowSeconds: window.limitWindowSeconds,
  }));

const buildCodexUsageRequestHeaders = (accountId?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
    'Cache-Control': 'no-cache, no-store, max-age=0',
    Pragma: 'no-cache',
  };
  const trimmedAccountId = String(accountId ?? '').trim();
  if (trimmedAccountId) {
    headers['Chatgpt-Account-Id'] = trimmedAccountId;
  }
  return headers;
};

const buildCodexQuotaRequestHeaders = (accountId?: string | null): Record<string, string> => ({
  ...buildCodexUsageRequestHeaders(accountId),
  Accept: 'application/json',
  'OpenAI-Beta': 'codex-1',
  'OAI-Language': 'zh-CN',
  Originator: 'Codex Desktop',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Dest': 'empty',
  Priority: 'u=4, i',
});

type CodexResetCreditsData = {
  availableCount: number | null;
  credits: CodexRateLimitResetCredit[];
  error: string;
};

const CODEX_RESET_CREDITS_REQUEST_TIMEOUT_MS = 8000;

const SHANGHAI_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeCodexResetCredit = (value: unknown): CodexRateLimitResetCredit | null => {
  const record = asRecord(value);
  if (!record) return null;
  if (normalizeStringValue(record.reset_type ?? record.resetType) !== 'codex_rate_limits') {
    return null;
  }
  if (normalizeStringValue(record.status) !== 'available') {
    return null;
  }

  const expiresAt = normalizeStringValue(record.expires_at ?? record.expiresAt);
  if (!expiresAt) return null;

  return {
    id: normalizeStringValue(record.id) ?? '',
    status: normalizeStringValue(record.status) ?? '',
    grantedAt: normalizeStringValue(record.granted_at ?? record.grantedAt) ?? '',
    expiresAt,
  };
};

const compareCodexResetCreditExpiry = (
  left: CodexRateLimitResetCredit,
  right: CodexRateLimitResetCredit
): number => {
  const leftTime = new Date(left.expiresAt).getTime();
  const rightTime = new Date(right.expiresAt).getTime();
  const leftRank = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
  const rightRank = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.id.localeCompare(right.id);
};

const normalizeCodexResetCreditsPayload = (
  payload: unknown
): {
  availableCount: number | null;
  credits: CodexRateLimitResetCredit[];
  invalidPayload: boolean;
} => {
  let parsedPayload = payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return { availableCount: null, credits: [], invalidPayload: true };
    }
    try {
      parsedPayload = JSON.parse(trimmed);
    } catch {
      return { availableCount: null, credits: [], invalidPayload: true };
    }
  }

  const record = asRecord(parsedPayload);
  if (!record) {
    return { availableCount: null, credits: [], invalidPayload: true };
  }

  const hasExpectedShape =
    'credits' in record || 'available_count' in record || 'availableCount' in record;
  const credits = Array.isArray(record.credits)
    ? record.credits
        .map((item) => normalizeCodexResetCredit(item))
        .filter((item): item is CodexRateLimitResetCredit => Boolean(item))
        .sort(compareCodexResetCreditExpiry)
    : [];

  return {
    availableCount: normalizeNumberValue(record.available_count ?? record.availableCount),
    credits,
    invalidPayload: !hasExpectedShape,
  };
};

const fetchCodexResetCredits = async (
  authIndex: string,
  accountId: string | null,
  t: TFunction
): Promise<CodexResetCreditsData> => {
  try {
    const result = await apiCallApi.request(
      {
        authIndex,
        method: 'GET',
        url: CODEX_RATE_LIMIT_RESET_CREDITS_URL,
        header: buildCodexQuotaRequestHeaders(accountId),
      },
      { timeout: CODEX_RESET_CREDITS_REQUEST_TIMEOUT_MS }
    );

    if (result.statusCode < 200 || result.statusCode >= 300) {
      return {
        availableCount: null,
        credits: [],
        error: getApiCallErrorMessage(result),
      };
    }

    const summary = normalizeCodexResetCreditsPayload(result.body ?? result.bodyText);
    if (summary.invalidPayload) {
      return {
        availableCount: null,
        credits: [],
        error: t('codex_quota.reset_credits_invalid_payload'),
      };
    }

    return {
      availableCount: summary.availableCount,
      credits: summary.credits,
      error: '',
    };
  } catch (err: unknown) {
    return {
      availableCount: null,
      credits: [],
      error: err instanceof Error ? err.message : t('common.unknown_error'),
    };
  }
};

export const formatShanghaiDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return SHANGHAI_TIME_FORMATTER.format(date).replace(',', '');
};

export const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CodexQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const planTypeFromFile = resolveCodexPlanType(file);
  const accountId = resolveCodexChatgptAccountId(file);
  const requestHeader = buildCodexUsageRequestHeaders(accountId);
  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: requestHeader,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode, { upstream: true });
  }

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const resetCredits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits ?? null;
  const usageResetCreditsAvailableCount = normalizeNumberValue(
    resetCredits?.available_count ?? resetCredits?.availableCount
  );
  const resetCreditsData = await fetchCodexResetCredits(authIndex, accountId, t);
  const resetCreditsCountFromDetails =
    resetCreditsData.credits.length > 0 ? resetCreditsData.credits.length : null;
  const rateLimitResetCreditsAvailableCount =
    resetCreditsData.availableCount ??
    resetCreditsCountFromDetails ??
    usageResetCreditsAvailableCount;
  const windows = buildCodexQuotaWindows(payload, t);
  return {
    planType: planTypeFromUsage ?? planTypeFromFile,
    rateLimitResetCreditsAvailableCount,
    rateLimitResetCredits: resetCreditsData.credits,
    rateLimitResetCreditsError: resetCreditsData.error,
    windows,
  };
};

const createCodexRedeemRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const segment = char === 'x' ? value : (value & 0x3) | 0x8;
    return segment.toString(16);
  });
};

const consumeCodexRateLimitResetCredit = async (
  file: AuthFileItem,
  t: TFunction
): Promise<void> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const accountId = resolveCodexChatgptAccountId(file);
  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
    header: buildCodexQuotaRequestHeaders(accountId),
    data: JSON.stringify({
      redeem_request_id: createCodexRedeemRequestId(),
    }),
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode, { upstream: true });
  }
};

export const resetCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CodexQuotaData> => {
  await consumeCodexRateLimitResetCredit(file, t);
  return fetchCodexQuota(file, t);
};

const resolveGeminiCliTierLabel = (
  payload: GeminiCliCodeAssistPayload | null,
  t: TFunction
): string | null => {
  if (!payload) return null;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const paidTier: GeminiCliUserTier | null | undefined = payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  if (!rawId) return null;
  const tierId = rawId.toLowerCase();
  const labelKey = GEMINI_CLI_TIER_LABELS[tierId];
  return labelKey ? t(`gemini_cli_quota.${labelKey}`) : rawId;
};

const resolveGeminiCliTierId = (payload: GeminiCliCodeAssistPayload | null): string | null => {
  if (!payload) return null;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const paidTier: GeminiCliUserTier | null | undefined = payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  return rawId ? rawId.toLowerCase() : null;
};

const resolveGeminiCliCreditBalance = (
  payload: GeminiCliCodeAssistPayload | null
): number | null => {
  if (!payload) return null;
  const paidTier: GeminiCliUserTier | null | undefined = payload.paidTier ?? payload.paid_tier;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const tier = paidTier ?? currentTier;
  if (!tier) return null;
  const credits: GeminiCliCredits[] = tier.availableCredits ?? tier.available_credits ?? [];
  let total = 0;
  let found = false;
  for (const credit of credits) {
    const creditType = normalizeStringValue(credit.creditType ?? credit.credit_type);
    if (creditType !== GEMINI_CLI_G1_CREDIT_TYPE) continue;
    const amount = normalizeNumberValue(credit.creditAmount ?? credit.credit_amount);
    if (amount !== null) {
      total += amount;
      found = true;
    }
  }
  return found ? total : null;
};

export const fetchGeminiCliCodeAssist = async (
  authIndex: string,
  projectId: string,
  t: TFunction
): Promise<GeminiCliSupplementaryQuota> => {
  try {
    const result = await apiCallApi.request({
      authIndex,
      method: 'POST',
      url: GEMINI_CLI_CODE_ASSIST_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({
        cloudaicompanionProject: projectId,
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
          duetProject: projectId,
        },
      }),
    });

    if (result.statusCode < 200 || result.statusCode >= 300) {
      return { tierLabel: null, tierId: null, creditBalance: null };
    }

    const payload = parseGeminiCliCodeAssistPayload(result.body ?? result.bodyText);
    return {
      tierLabel: resolveGeminiCliTierLabel(payload, t),
      tierId: resolveGeminiCliTierId(payload),
      creditBalance: resolveGeminiCliCreditBalance(payload),
    };
  } catch {
    return { tierLabel: null, tierId: null, creditBalance: null };
  }
};

export const fetchGeminiCliQuotaBuckets = async (
  file: AuthFileItem,
  t: TFunction
): Promise<GeminiCliQuotaBucketsData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('gemini_cli_quota.missing_auth_index'));
  }

  const projectId = resolveGeminiCliProjectId(file);
  if (!projectId) {
    throw new Error(t('gemini_cli_quota.missing_project_id'));
  }

  const quotaResponse = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: GEMINI_CLI_QUOTA_URL,
    header: { ...GEMINI_CLI_REQUEST_HEADERS },
    data: JSON.stringify({ project: projectId }),
  });
  if (quotaResponse.statusCode < 200 || quotaResponse.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(quotaResponse), quotaResponse.statusCode, {
      upstream: true,
    });
  }

  const payload = parseGeminiCliQuotaPayload(quotaResponse.body ?? quotaResponse.bodyText);
  const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];

  const parsedBuckets = buckets
    .map((bucket) => {
      const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
      if (!modelId) return null;
      const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
      const remainingFractionRaw = normalizeQuotaFraction(
        bucket.remainingFraction ?? bucket.remaining_fraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remainingAmount ?? bucket.remaining_amount
      );
      const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }
      const remainingFraction = remainingFractionRaw ?? fallbackFraction;
      return {
        modelId,
        tokenType,
        remainingFraction,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  return {
    authIndex,
    projectId,
    buckets: buildGeminiCliQuotaBuckets(parsedBuckets),
  };
};

const normalizeFlagValue = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return undefined;
};

const parseClaudeProfilePayload = (payload: unknown): ClaudeProfileResponse | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeProfileResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeProfileResponse;
  }
  return null;
};

const resolveClaudePlanType = (profile: ClaudeProfileResponse | null): string | null => {
  if (!profile) return null;

  const hasClaudeMax = normalizeFlagValue(profile.account?.has_claude_max);
  if (hasClaudeMax) return 'plan_max';

  const hasClaudePro = normalizeFlagValue(profile.account?.has_claude_pro);
  if (hasClaudePro) return 'plan_pro';

  const organizationType = normalizeStringValue(
    profile.organization?.organization_type
  )?.toLowerCase();
  const subscriptionStatus = normalizeStringValue(
    profile.organization?.subscription_status
  )?.toLowerCase();

  if (organizationType === 'claude_team' && subscriptionStatus === 'active') {
    return 'plan_team';
  }

  if (hasClaudeMax === false && hasClaudePro === false) return 'plan_free';

  return null;
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const windows: ClaudeQuotaWindow[] = [];

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
    });
  }

  return windows;
};

export const fetchClaudeQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<ClaudeQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  const [usageResult, profileResult] = await Promise.allSettled([
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_USAGE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_PROFILE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
  ]);

  if (usageResult.status === 'rejected') {
    throw usageResult.reason;
  }

  const result = usageResult.value;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode, { upstream: true });
  }

  const payload = parseClaudeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const planType =
    profileResult.status === 'fulfilled' &&
    profileResult.value.statusCode >= 200 &&
    profileResult.value.statusCode < 300
      ? resolveClaudePlanType(
          parseClaudeProfilePayload(profileResult.value.body ?? profileResult.value.bodyText)
        )
      : null;

  return { windows, extraUsage: payload.extra_usage, planType };
};

export const fetchKimiQuota = async (file: AuthFileItem, t: TFunction): Promise<KimiQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kimi_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: KIMI_USAGE_URL,
    header: { ...KIMI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode, { upstream: true });
  }

  const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kimi_quota.empty_data'));
  }

  return buildKimiQuotaRows(payload);
};

const resolveKiroOverageQuota = (
  payload: KiroQuotaPayload,
  usageBreakdown: KiroQuotaPayload['usageBreakdownList'][number] | undefined
): KiroOverageQuota | null => {
  const status = normalizeStringValue(payload.overageConfiguration?.overageStatus);
  if (status?.toUpperCase() !== 'ENABLED') {
    return null;
  }

  const currentOverages = normalizeNumberValue(
    usageBreakdown?.currentOveragesWithPrecision ?? usageBreakdown?.currentOverages
  );
  const cap = normalizeNumberValue(
    usageBreakdown?.overageCapWithPrecision ?? usageBreakdown?.overageCap
  );
  const unitLabel = normalizeStringValue(
    usageBreakdown?.displayNamePlural ?? usageBreakdown?.displayName
  );

  if (!status && currentOverages === null && cap === null) {
    return null;
  }

  return {
    status,
    currentOverages,
    cap,
    unitLabel,
  };
};

export const fetchKiroQuota = async (file: AuthFileItem, _t: TFunction): Promise<KiroQuotaData> => {
  const payload = await authFilesApi.getKiroUsage(file.name);
  const subscriptionTitle = normalizeStringValue(payload.subscriptionInfo?.subscriptionTitle);
  const usageBreakdown = payload.usageBreakdownList?.[0];
  const overageStatus = normalizeStringValue(payload.overageConfiguration?.overageStatus);

  let baseQuota: KiroBaseQuota | null = null;
  let freeTrialQuota: KiroFreeTrialQuota | null = null;
  const overageQuota = resolveKiroOverageQuota(payload, usageBreakdown);

  if (usageBreakdown) {
    const limit = normalizeNumberValue(usageBreakdown.usageLimitWithPrecision);
    const used = normalizeNumberValue(usageBreakdown.currentUsageWithPrecision);
    const resetTime = normalizeNumberValue(usageBreakdown.nextDateReset ?? payload.nextDateReset);

    if (limit !== null && used !== null && resetTime !== null) {
      baseQuota = { used, limit, resetTime };
    }

    const freeTrialInfo = usageBreakdown.freeTrialInfo;
    if (freeTrialInfo) {
      const trialLimit = normalizeNumberValue(freeTrialInfo.usageLimitWithPrecision);
      const trialUsed = normalizeNumberValue(freeTrialInfo.currentUsageWithPrecision);
      const trialExpiry = normalizeNumberValue(freeTrialInfo.freeTrialExpiry);
      const trialStatus = normalizeStringValue(freeTrialInfo.freeTrialStatus);

      if (trialLimit !== null && trialUsed !== null && trialExpiry !== null && trialStatus) {
        freeTrialQuota = {
          used: trialUsed,
          limit: trialLimit,
          expiry: trialExpiry,
          status: trialStatus,
        };
      }
    }
  }

  return { subscriptionTitle, baseQuota, freeTrialQuota, overageQuota, overageStatus };
};

const normalizeXaiCentValue = (value: XaiBillingConfig['monthlyLimit']): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizeNumberValue((value as { val?: unknown }).val);
  }
  return normalizeNumberValue(value);
};

export const buildXaiBillingSummary = (
  config: XaiBillingConfig | null | undefined,
  subscriptionTier?: string | null
): XaiBillingSummary | null => {
  if (!config || typeof config !== 'object') return null;

  const monthlyLimitCents = normalizeXaiCentValue(config.monthlyLimit ?? config.monthly_limit);
  const usedCents = normalizeXaiCentValue(config.used);
  const onDemandCapCents = normalizeXaiCentValue(config.onDemandCap ?? config.on_demand_cap);
  const currentPeriod = config.currentPeriod ?? config.current_period;
  const productUsage = config.productUsage ?? config.product_usage;
  const grokBuildUsagePercent = Array.isArray(productUsage)
    ? productUsage.find((item) => normalizeStringValue(item?.product)?.toLowerCase() === 'grokbuild')
    : undefined;
  const includedUsagePercent = normalizeNumberValue(
    grokBuildUsagePercent?.usagePercent ??
      grokBuildUsagePercent?.usage_percent ??
      config.creditUsagePercent
  );
  const billingPeriodStart =
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start ?? currentPeriod?.start) ??
    undefined;
  const billingPeriodEnd =
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end ?? currentPeriod?.end) ?? undefined;
  const usesIncludedUsage = monthlyLimitCents === null || monthlyLimitCents <= 0;

  if (
    monthlyLimitCents === null &&
    usedCents === null &&
    onDemandCapCents === null &&
    includedUsagePercent === null &&
    !billingPeriodEnd
  ) {
    return null;
  }

  const usedPercent =
    monthlyLimitCents !== null && monthlyLimitCents > 0 && usedCents !== null
      ? (usedCents / monthlyLimitCents) * 100
      : includedUsagePercent === null
        ? null
        : Math.max(0, Math.min(100, includedUsagePercent));

  return {
    monthlyLimitCents,
    usedCents,
    onDemandCapCents,
    billingPeriodStart,
    billingPeriodEnd,
    usedPercent,
    subscriptionTier: normalizeStringValue(subscriptionTier) ?? undefined,
    usesIncludedUsage,
  };
};

const xaiUserIDFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return normalizeStringValue((payload as { userId?: unknown }).userId);
};

const xaiRequest = (authIndex: string, url: string, header: Record<string, string> = {}) =>
  apiCallApi.request({
    authIndex,
    method: 'GET',
    url,
    header: { ...XAI_REQUEST_HEADERS, ...header },
  });

const xaiBillingSummaryFromResult = (result: Awaited<ReturnType<typeof apiCallApi.request>>) => {
  const payload = parseXaiBillingPayload(result.body ?? result.bodyText);
  return buildXaiBillingSummary(payload?.config, payload?.subscriptionTier ?? payload?.subscription_tier);
};

export const fetchXaiQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<XaiBillingSummary> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('xai_quota.missing_auth_index'));
  }

  const userResult = await xaiRequest(authIndex, XAI_USER_URL);
  if (userResult.statusCode >= 200 && userResult.statusCode < 300) {
    const userID = xaiUserIDFromPayload(userResult.body ?? userResult.bodyText);
    if (userID) {
      const creditsResult = await xaiRequest(authIndex, XAI_CREDITS_BILLING_URL, { 'x-userid': userID });
      if (creditsResult.statusCode >= 200 && creditsResult.statusCode < 300) {
        const creditsSummary = xaiBillingSummaryFromResult(creditsResult);
        if (creditsSummary) return creditsSummary;
      }
    }
  }

  // API-key auth cannot call the OAuth /user endpoint. Keep the original billing
  // request as a compatibility path for those credentials and older proxy versions.
  const billingResult = await xaiRequest(authIndex, XAI_BILLING_URL);
  if (billingResult.statusCode < 200 || billingResult.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(billingResult), billingResult.statusCode, {
      upstream: true,
    });
  }

  const summary = xaiBillingSummaryFromResult(billingResult);
  if (!summary) {
    throw new Error(t('xai_quota.empty_data'));
  }

  return summary;
};

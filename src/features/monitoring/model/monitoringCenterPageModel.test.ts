import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchClaudeQuota,
  fetchCodexQuota,
  fetchGeminiCliCodeAssist,
  fetchGeminiCliQuotaBuckets,
  fetchXaiQuota,
} from '@/utils/quota';
import type { MonitoringAccountQuotaTarget } from '@/features/monitoring/accountOverviewQuotaTargets';
import type {
  MonitoringAccountRow,
  MonitoringApiKeyRow,
} from '@/features/monitoring/hooks/useMonitoringData';
import {
  buildAccountOptions,
  buildApiKeyOptionsFromRows,
  buildChannelOptionsFromValues,
  buildModelOptionsFromValues,
  buildPrimarySummaryCards,
  buildProviderOptionsFromValues,
  buildSecondarySummaryCards,
  requestAccountQuota,
} from './monitoringCenterPageModel';

vi.mock('@/utils/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/quota')>();
  return {
    ...actual,
    fetchAntigravityQuota: vi.fn(),
    fetchClaudeQuota: vi.fn(),
    fetchCodexQuota: vi.fn(),
    fetchGeminiCliCodeAssist: vi.fn(),
    fetchGeminiCliQuotaBuckets: vi.fn(),
    fetchKimiQuota: vi.fn(),
    fetchXaiQuota: vi.fn(),
  };
});

const t = ((key: string, options?: Record<string, unknown>) => {
  const copy: Record<string, string> = {
    'antigravity_quota.title': 'Antigravity Quota',
    'claude_quota.title': 'Claude Quota',
    'claude_quota.plan_label': 'Plan',
    'claude_quota.plan_pro': 'Pro',
    'claude_quota.extra_usage_label': 'Extra Usage',
    'claude_quota.empty_windows': 'No Claude quota data',
    'claude_quota.five_hour': '5-hour limit',
    'codex_quota.title': 'Codex Quota',
    'codex_quota.empty_windows': 'No Codex quota data',
    'codex_quota.plan_label': 'Plan',
    'codex_quota.plan_free': 'Free',
    'codex_quota.monthly_window': 'Monthly limit',
    'codex_quota.window_usage_duration': '{{used}} / {{total}} used',
    'gemini_cli_quota.title': 'Gemini CLI Quota',
    'gemini_cli_quota.tier_label': 'Tier',
    'gemini_cli_quota.credit_label': 'Google One AI Credits',
    'gemini_cli_quota.credit_amount': '{{count}} credits',
    'gemini_cli_quota.empty_buckets': 'No Gemini quota data',
    'gemini_cli_quota.remaining_amount': 'Remaining {{count}}',
    'kimi_quota.title': 'Kimi Quota',
    'kimi_quota.empty_data': 'No Kimi quota data',
    'xai_quota.title': 'xAI Quota',
    'xai_quota.empty_data': 'No xAI quota data',
    'monitoring.accounts_suffix': 'accounts',
    'monitoring.success_suffix': 'Success',
    'monitoring.success_calls': 'Successful Calls',
    'monitoring.total_calls': 'Total Calls',
    'monitoring.total_calls_short': 'Calls',
    'monitoring.call_success_rate': 'Call Success Rate',
    'monitoring.call_success_rate_short': 'Success Rate',
    'monitoring.failure_calls': 'Failure Calls',
    'monitoring.failure_calls_short': 'Failures',
    'monitoring.groups_suffix': 'groups',
    'monitoring.estimated_cost': 'Estimated Cost',
    'monitoring.estimated_cost_short': 'Cost',
    'monitoring.estimated_cost_hint': 'Configured prices',
    'monitoring.estimated_cost_missing': 'Missing prices',
    'monitoring.total_tokens': 'Total Tokens',
    'monitoring.total_tokens_short': 'Tokens',
    'monitoring.reasoning_tokens': 'Reasoning Tokens',
    'monitoring.input_tokens': 'Input Tokens',
    'monitoring.input_tokens_short': 'Input',
    'monitoring.output_tokens': 'Output Tokens',
    'monitoring.output_tokens_short': 'Output',
    'monitoring.cached_tokens': 'Cached Tokens',
    'monitoring.cached_tokens_short': 'Cached',
    'monitoring.cache_total_tokens': 'Read/Write Cache Tokens',
    'monitoring.cache_total_tokens_short': 'Cache Tokens',
    'monitoring.cache_hit_rate': 'Cache Hit Rate',
    'monitoring.cache_read_tokens_short': 'Cache Read',
    'monitoring.cache_write_tokens_short': 'Cache Write',
    'monitoring.of_token_mix': 'of token mix',
    'monitoring.of_input_tokens': 'Hit rate',
    'xai_quota.monthly_limit': 'Monthly billing limit',
    'xai_quota.on_demand_cap': 'On-demand cap',
    'xai_quota.usage_amount': '{{used}} / {{limit}}',
  };
  let value = copy[key] ?? key;
  Object.entries(options ?? {}).forEach(([name, replacement]) => {
    value = value.replace(`{{${name}}}`, String(replacement));
  });
  return value;
}) as TFunction;

const createTarget = (
  overrides: Partial<MonitoringAccountQuotaTarget>
): MonitoringAccountQuotaTarget => ({
  key: overrides.key ?? 'claude::1::auth.json',
  provider: overrides.provider ?? 'claude',
  authIndex: overrides.authIndex ?? '1',
  authLabel: overrides.authLabel ?? 'Auth',
  fileName: overrides.fileName ?? 'auth.json',
  file: overrides.file ?? {
    name: overrides.fileName ?? 'auth.json',
    type: overrides.provider ?? 'claude',
    authIndex: overrides.authIndex ?? '1',
  },
  accountId: overrides.accountId ?? null,
  planType: overrides.planType ?? null,
});

const createAccountRow = (
  account: string,
  overrides: Partial<MonitoringAccountRow> = {}
): MonitoringAccountRow => ({
  id: account,
  account,
  displayAccount: account,
  accountMasked: account,
  authLabels: [],
  authIndices: [],
  channels: [],
  totalCalls: 1,
  successCalls: 1,
  failureCalls: 0,
  successRate: 1,
  inputTokens: 1,
  outputTokens: 1,
  cachedTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 2,
  totalCost: 0,
  averageLatencyMs: null,
  lastSeenAt: 1,
  recentPattern: [],
  models: [],
  ...overrides,
});

const createApiKeyRow = (apiKeyHash: string, label: string): MonitoringApiKeyRow => ({
  id: apiKeyHash,
  apiKeyHash,
  apiKeyLabel: label,
  apiKeyMasked: label,
  isUnknown: false,
  authLabels: [],
  sourceLabels: [],
  channels: [],
  totalCalls: 1,
  successCalls: 1,
  failureCalls: 0,
  successRate: 1,
  inputTokens: 1,
  outputTokens: 1,
  cachedTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 2,
  totalCost: 0,
  averageLatencyMs: null,
  lastSeenAt: 1,
  models: [],
});

describe('monitoringCenterPageModel filter options', () => {
  it('keeps alternate candidates when a dynamic filter already has a selected value', () => {
    expect(
      buildProviderOptionsFromValues(['codex', 'gemini'], 'codex', t).map((item) => item.value)
    ).toEqual(['all', 'codex', 'gemini']);
    expect(
      buildAccountOptions(
        [createAccountRow('alice@example.com'), createAccountRow('bob@example.com')],
        'alice@example.com',
        t
      ).map((item) => item.value)
    ).toEqual(['all', 'alice@example.com', 'bob@example.com']);
    expect(
      buildModelOptionsFromValues(['gpt-a', 'gpt-b'], 'gpt-a', t).map((item) => item.value)
    ).toEqual(['all', 'gpt-a', 'gpt-b']);
    expect(
      buildChannelOptionsFromValues(['Primary', 'Backup'], 'Primary', t).map((item) => item.value)
    ).toEqual(['all', 'Backup', 'Primary']);
    expect(
      buildApiKeyOptionsFromRows(
        [createApiKeyRow('key-a', 'Key A'), createApiKeyRow('key-b', 'Key B')],
        'key-a',
        t
      ).map((item) => item.value)
    ).toEqual(['all', 'key-a', 'key-b']);
  });

  it('uses account row filter values for account options', () => {
    expect(
      buildAccountOptions(
        [
          createAccountRow('OpenAI Compatible', {
            filterValue: 'auth:openai-auth',
          }),
        ],
        'auth:openai-auth',
        t
      ).map((item) => item.value)
    ).toEqual(['all', 'auth:openai-auth']);
  });

});

describe('monitoringCenterPageModel summary cards', () => {
  it('shows successful calls beside the total calls value', () => {
    const cards = buildPrimarySummaryCards({
      summary: {
        totalCalls: 317,
        successCalls: 155,
        failureCalls: 162,
        successRate: 155 / 317,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        averageLatencyMs: 5930,
        zeroTokenCalls: 0,
        rpm30m: 0,
        tpm30m: 0,
        avgDailyRequests: 0,
        avgDailyTokens: 0,
        approxTasks: 0,
        approxTaskFailures: 0,
        approxTaskSuccessRate: 1,
        zeroTokenModels: [],
      },
      accountCount: 5,
      failedGroupCount: 4,
      hasPrices: true,
      locale: 'en',
      t,
    });

    expect(cards[0]).toMatchObject({
      value: '317',
      secondaryValue: 'Success 155',
      secondaryValueTitle: 'Successful Calls 155',
      meta: '5 accounts',
    });
  });

  it('reports cache-read share of total input tokens', () => {
    const cards = buildSecondarySummaryCards(
      {
        totalCalls: 0,
        successCalls: 0,
        failureCalls: 0,
        successRate: 0,
        inputTokens: 100,
        outputTokens: 0,
        cachedTokens: 80,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 100,
        totalCost: 0,
        averageLatencyMs: null,
        zeroTokenCalls: 0,
        rpm30m: 0,
        tpm30m: 0,
        avgDailyRequests: 0,
        avgDailyTokens: 0,
        approxTasks: 0,
        approxTaskFailures: 0,
        approxTaskSuccessRate: 1,
        zeroTokenModels: [],
      },
      'en',
      t
    );

    expect(cards[3]).toMatchObject({
      label: 'Cache Tokens',
      value: '80',
      meta: 'Cache Hit Rate 80.0% · Cache Read 80 · Cache Write 0',
    });
    expect(cards[1]).toMatchObject({
      label: 'Input',
      value: '100',
    });
  });

  it('shows zero hit rate when Claude only creates cache without cache reads', () => {
    const cards = buildSecondarySummaryCards(
      {
        totalCalls: 0,
        successCalls: 0,
        failureCalls: 0,
        successRate: 0,
        inputTokens: 342,
        outputTokens: 472,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 206_900,
        reasoningTokens: 0,
        totalTokens: 207_700,
        totalCost: 0,
        averageLatencyMs: null,
        zeroTokenCalls: 0,
        rpm30m: 0,
        tpm30m: 0,
        avgDailyRequests: 0,
        avgDailyTokens: 0,
        approxTasks: 0,
        approxTaskFailures: 0,
        approxTaskSuccessRate: 1,
        zeroTokenModels: [],
      },
      'en',
      t
    );

    expect(cards[3]).toMatchObject({
      label: 'Cache Tokens',
      value: '206.9K',
      meta: 'Cache Hit Rate 0.0% · Cache Read 0 · Cache Write 206.9K',
    });
  });
});

describe('monitoringCenterPageModel account quota', () => {
  beforeEach(() => {
    vi.mocked(fetchClaudeQuota).mockReset();
    vi.mocked(fetchCodexQuota).mockReset();
    vi.mocked(fetchGeminiCliCodeAssist).mockReset();
    vi.mocked(fetchGeminiCliQuotaBuckets).mockReset();
    vi.mocked(fetchXaiQuota).mockReset();
  });

  it('maps Claude usage windows into account quota entries', async () => {
    vi.mocked(fetchClaudeQuota).mockResolvedValue({
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          labelKey: 'claude_quota.five_hour',
          usedPercent: 40,
          resetLabel: '05/20 12:00',
        },
      ],
      planType: 'plan_pro',
      extraUsage: {
        is_enabled: true,
        used_credits: 150,
        monthly_limit: 500,
        utilization: null,
      },
    });

    const entry = await requestAccountQuota(createTarget({ provider: 'claude' }), t);

    expect(entry).toMatchObject({
      provider: 'claude',
      providerLabel: 'Claude Quota',
      metaLabels: ['Claude Quota', 'Plan: Pro', 'Extra Usage: $1.50 / $5.00'],
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          remainingPercent: 60,
          resetLabel: '05/20 12:00',
        },
      ],
    });
  });

  it('maps Codex monthly quota windows into account quota entries', async () => {
    vi.mocked(fetchCodexQuota).mockResolvedValue({
      planType: 'free',
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: '',
      windows: [
        {
          id: 'monthly',
          label: 'Monthly limit',
          labelKey: 'codex_quota.monthly_window',
          usedPercent: 5,
          resetLabel: '06/30 12:00',
          limitWindowSeconds: 2_592_000,
        },
      ],
    });

    const entry = await requestAccountQuota(
      createTarget({
        provider: 'codex',
        authIndex: '2',
        fileName: 'codex.json',
      }),
      t
    );

    expect(entry).toMatchObject({
      provider: 'codex',
      providerLabel: 'Codex Quota',
      metaLabels: ['Codex Quota', 'Plan: Free'],
      planType: 'free',
      windows: [
        {
          id: 'monthly',
          label: 'Monthly limit',
          remainingPercent: 95,
          resetLabel: '06/30 12:00',
          usageLabel: '1.5d / 30d used',
        },
      ],
    });
  });

  it('maps Gemini CLI buckets and supplementary tier metadata', async () => {
    vi.mocked(fetchGeminiCliQuotaBuckets).mockResolvedValue({
      authIndex: '2',
      projectId: 'project-1',
      buckets: [
        {
          id: 'gemini-pro-series',
          label: 'Gemini Pro Series',
          remainingFraction: 0.25,
          remainingAmount: 12,
          resetTime: undefined,
          tokenType: 'tokens',
        },
      ],
    });
    vi.mocked(fetchGeminiCliCodeAssist).mockResolvedValue({
      tierLabel: 'Ultra',
      tierId: 'g1-ultra-tier',
      creditBalance: 7,
    });

    const entry = await requestAccountQuota(
      createTarget({
        provider: 'gemini-cli',
        authIndex: '2',
        fileName: 'gemini-cli.json',
      }),
      t
    );

    expect(entry.metaLabels).toEqual([
      'Gemini CLI Quota',
      'Tier: Ultra',
      'Google One AI Credits: 7 credits',
    ]);
    expect(entry.windows).toMatchObject([
      {
        id: 'gemini-pro-series',
        label: 'Gemini Pro Series',
        remainingPercent: 25,
        resetLabel: '-',
        usageLabel: 'Remaining 12 · tokens',
      },
    ]);
    expect(fetchGeminiCliCodeAssist).toHaveBeenCalledWith('2', 'project-1', t);
  });

  it('maps xAI billing into account quota entries', async () => {
    vi.mocked(fetchXaiQuota).mockResolvedValue({
      monthlyLimitCents: 10000,
      usedCents: 2500,
      onDemandCapCents: 5000,
      billingPeriodStart: '2026-05-01T00:00:00Z',
      billingPeriodEnd: '2026-06-01T00:00:00Z',
      usedPercent: 25,
    });

    const entry = await requestAccountQuota(
      createTarget({
        provider: 'xai',
        authIndex: '3',
        fileName: 'xai.json',
      }),
      t
    );

    expect(entry).toMatchObject({
      provider: 'xai',
      providerLabel: 'xAI Quota',
      metaLabels: ['xAI Quota', 'On-demand cap: $50.00'],
      windows: [
        {
          id: 'monthly-limit',
          label: 'Monthly billing limit',
          remainingPercent: 75,
          usageLabel: '$25.00 / $100.00',
        },
      ],
    });
  });
});

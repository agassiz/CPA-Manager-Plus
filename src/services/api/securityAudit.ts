import { apiClient } from './client';

export interface SecurityAuditRule {
  name: string;
  pattern: string;
  enabled: boolean;
}

export interface SecurityAuditGuardConfig {
  enabled: boolean;
  'base-url': string;
  'api-key'?: string;
  model: string;
  'timeout-ms': number;
  'input-limit': number;
  'max-concurrency': number;
  'max-waiting': number;
  scanners: string[];
}

export interface SecurityAuditModerationsConfig {
  enabled: boolean;
  'base-url': string;
  'api-key'?: string;
  model: string;
  'timeout-ms': number;
  'input-limit': number;
  'max-concurrency': number;
  'max-waiting': number;
  categories: string[];
  thresholds: Record<string, number>;
  'usage-price-per-million-input-tokens': number;
}

export type SecurityAuditEngine = 'qwen3guard' | 'openai_moderations';

export interface ScannerDefinition {
  id: string;
  label: string;
  label_zh: string;
}

export interface SecurityAuditEngineDefaults {
  guard: SecurityAuditGuardConfig;
  moderations: SecurityAuditModerationsConfig;
}

export interface SecurityAuditConfig {
  enabled: boolean;
  /** Whether requests routed to third-party providers should be audited. */
  'audit-third-party': boolean;
  'blocking-enabled': boolean;
  'blocking-latest-turn-only': boolean;
  'store-pass-events': boolean;
  'max-events': number;
  rules: SecurityAuditRule[];
  engine: SecurityAuditEngine;
  guard: SecurityAuditGuardConfig;
  moderations: SecurityAuditModerationsConfig;
  'has-api-key'?: boolean;
  'has-moderations-api-key'?: boolean;
  'scanner-catalog'?: Record<string, ScannerDefinition>;
  'moderation-category-catalog'?: Record<string, ScannerDefinition>;
  'engine-defaults'?: SecurityAuditEngineDefaults;
}

export interface SecurityAuditEvent {
  id: number;
  created_at: string;
  request_id?: string;
  endpoint: string;
  protocol: string;
  model?: string;
  mode: string;
  source: string;
  decision: string;
  risk_level: string;
  matched_rules: string[];
  categories: string[];
  matched_scanners: string[];
  prompt_hash: string;
  prompt_preview: string;
  prompt_length: number;
  guard_endpoint?: string;
  latency_ms: number;
  chunk_total: number;
  error_code?: string;
  highest_category?: string;
  highest_score: number;
  category_scores: Record<string, number>;
}

export interface SecurityAuditEventsResponse {
  items: SecurityAuditEvent[];
  total: number;
  'database-path'?: string;
}

export type SecurityAuditUsageGroupBy = 'day' | 'engine' | 'model';

export interface SecurityAuditUsageBucket {
  key: string;
  calls: number;
  success_calls: number;
  failed_calls: number;
  input_tokens: number;
  input_chars: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  estimated_cost: number;
}

export interface SecurityAuditUsageSummary {
  group_by: SecurityAuditUsageGroupBy;
  from_ms: number;
  to_ms: number;
  total: SecurityAuditUsageBucket;
  buckets: SecurityAuditUsageBucket[];
  price_per_million_input_tokens: number;
  database_path?: string;
}

type SecurityAuditConfigResponse = Omit<
  SecurityAuditConfig,
  'audit-third-party' | 'rules' | 'engine' | 'guard' | 'moderations'
> & {
  // Older backends omitted this field; preserve the default bypass behavior.
  'audit-third-party'?: boolean | null;
  rules?: SecurityAuditRule[] | null;
  engine?: SecurityAuditEngine | null;
  guard: Omit<SecurityAuditGuardConfig, 'scanners'> & {
    scanners?: string[] | null;
  };
  // The backend always serializes the moderations block; only its policy lists
  // are nullable when the engine is not selected.
  moderations: Omit<SecurityAuditModerationsConfig, 'categories' | 'thresholds'> & {
    categories?: string[] | null;
    thresholds?: Record<string, number> | null;
  };
};

type SecurityAuditEventResponse = Omit<
  SecurityAuditEvent,
  'matched_rules' | 'categories' | 'matched_scanners' | 'category_scores'
> & {
  matched_rules?: string[] | null;
  categories?: string[] | null;
  matched_scanners?: string[] | null;
  category_scores?: Record<string, number> | null;
};

type SecurityAuditEventsApiResponse = Omit<SecurityAuditEventsResponse, 'items'> & {
  items?: SecurityAuditEventResponse[] | null;
};

type SecurityAuditUsageApiResponse = Omit<SecurityAuditUsageSummary, 'buckets'> & {
  buckets?: SecurityAuditUsageBucket[] | null;
};

const normalizeConfig = (config: SecurityAuditConfigResponse): SecurityAuditConfig => ({
  ...config,
  'audit-third-party': config['audit-third-party'] ?? false,
  'blocking-latest-turn-only': config['blocking-latest-turn-only'] ?? false,
  rules: config.rules ?? [],
  // 'engine' is absent only for configuration files written before the
  // dual-engine release, where Qwen3Guard was the single audit model.
  engine: config.engine ?? 'qwen3guard',
  guard: {
    ...config.guard,
    'max-concurrency': config.guard['max-concurrency'] ?? 2,
    'max-waiting': config.guard['max-waiting'] ?? 64,
    scanners: config.guard.scanners ?? [],
  },
  moderations: {
    ...config.moderations,
    categories: config.moderations.categories ?? [],
    thresholds: config.moderations.thresholds ?? {},
  },
});

const normalizeEvents = (response: SecurityAuditEventsApiResponse): SecurityAuditEventsResponse => ({
  ...response,
  items: (response.items ?? []).map((event) => ({
    ...event,
    chunk_total: event.chunk_total ?? 0,
    matched_rules: event.matched_rules ?? [],
    categories: event.categories ?? [],
    matched_scanners: event.matched_scanners ?? [],
    category_scores: event.category_scores ?? {},
  })),
});

const normalizeUsage = (response: SecurityAuditUsageApiResponse): SecurityAuditUsageSummary => ({
  ...response,
  buckets: response.buckets ?? [],
});

export const securityAuditApi = {
  getConfig: async () =>
    normalizeConfig(
      await apiClient.get<SecurityAuditConfigResponse>('/security-audit/config')
    ),
  updateConfig: (config: SecurityAuditConfig) =>
    apiClient
      .put<SecurityAuditConfigResponse>('/security-audit/config', config)
      .then(normalizeConfig),
  probe: (
    engine: SecurityAuditEngine,
    guard: SecurityAuditGuardConfig,
    moderations: SecurityAuditModerationsConfig
  ) =>
    apiClient.post<{ ok: boolean; 'latency-ms': number; result?: unknown; error?: string }>(
      '/security-audit/probe',
      { engine, guard, moderations }
    ),
  getEvents: async () =>
    normalizeEvents(
      await apiClient.get<SecurityAuditEventsApiResponse>('/security-audit/events')
    ),
  clearEvents: () => apiClient.delete<{ status: string }>('/security-audit/events'),
  getUsage: async (groupBy: SecurityAuditUsageGroupBy) =>
    normalizeUsage(
      await apiClient.get<SecurityAuditUsageApiResponse>('/security-audit/usage', {
        params: { 'group-by': groupBy },
      })
    ),
};

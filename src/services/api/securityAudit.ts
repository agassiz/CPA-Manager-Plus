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

export interface ScannerDefinition {
  id: string;
  label: string;
  label_zh: string;
}

export interface SecurityAuditConfig {
  enabled: boolean;
  'blocking-enabled': boolean;
  'blocking-latest-turn-only': boolean;
  'store-pass-events': boolean;
  'max-events': number;
  rules: SecurityAuditRule[];
  guard: SecurityAuditGuardConfig;
  'has-api-key'?: boolean;
  'scanner-catalog'?: Record<string, ScannerDefinition>;
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
}

export interface SecurityAuditEventsResponse {
  items: SecurityAuditEvent[];
  total: number;
  'database-path'?: string;
}

type SecurityAuditConfigResponse = Omit<SecurityAuditConfig, 'rules' | 'guard'> & {
  rules?: SecurityAuditRule[] | null;
  guard: Omit<SecurityAuditGuardConfig, 'scanners'> & {
    scanners?: string[] | null;
  };
};

type SecurityAuditEventResponse = Omit<
  SecurityAuditEvent,
  'matched_rules' | 'categories' | 'matched_scanners'
> & {
  matched_rules?: string[] | null;
  categories?: string[] | null;
  matched_scanners?: string[] | null;
};

type SecurityAuditEventsApiResponse = Omit<SecurityAuditEventsResponse, 'items'> & {
  items?: SecurityAuditEventResponse[] | null;
};

const normalizeConfig = (config: SecurityAuditConfigResponse): SecurityAuditConfig => ({
  ...config,
  'blocking-latest-turn-only': config['blocking-latest-turn-only'] ?? false,
  rules: config.rules ?? [],
  guard: {
    ...config.guard,
    'max-concurrency': config.guard['max-concurrency'] ?? 2,
    'max-waiting': config.guard['max-waiting'] ?? 64,
    scanners: config.guard.scanners ?? [],
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
  })),
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
  probe: (guard: SecurityAuditGuardConfig) =>
    apiClient.post<{ ok: boolean; 'latency-ms': number; result?: unknown; error?: string }>(
      '/security-audit/probe',
      { guard }
    ),
  getEvents: async () =>
    normalizeEvents(
      await apiClient.get<SecurityAuditEventsApiResponse>('/security-audit/events')
    ),
  clearEvents: () => apiClient.delete<{ status: string }>('/security-audit/events'),
};

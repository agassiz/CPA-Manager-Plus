import axios from 'axios';
import type { UsagePayload } from '@/features/monitoring/hooks/useUsageData';
import { normalizeApiBase } from '@/utils/connection';
import {
  calculateCost,
  collectUsageDetailsWithEndpoint,
  loadModelPrices,
  type ModelPrice,
  type UsageDetailWithEndpoint,
} from '@/utils/usage';

const USAGE_SERVICE_ERROR_CODES = new Set([
  'request_failed',
  'connection_env_managed',
  'cpa_connection_required',
  'cpa_connection_required_for_monitoring',
  'management_api_validation_failed',
  'management_api_config_failed',
  'invalid_time_zone',
  'enable_cpa_usage_statistics_failed',
  'setup_env_managed',
  'invalid_existing_management_key',
  'invalid_admin_key',
  'invalid_management_key',
  'usage_service_not_configured',
  'prices_required',
  'api_key_aliases_required',
  'api_key_alias_duplicate',
  'model_price_sync_failed',
  'method_not_allowed',
]);

export interface UsageServiceApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  data?: unknown;
}

export interface UsageRequestOptions {
  includeDetails?: boolean;
}

export interface UsageServiceCollectorStatus {
  collector?: string;
  upstream?: string;
  mode?: string;
  transport?: string;
  queue?: string;
  lastConsumedAt?: number;
  lastInsertedAt?: number;
  totalInserted?: number;
  totalSkipped?: number;
  deadLetters?: number;
  lastError?: string;
}

export interface UsageServiceStatus {
  service?: string;
  dbPath?: string;
  events?: number;
  deadLetters?: number;
  collector?: UsageServiceCollectorStatus;
}

export interface CodexInspectionResult {
  id: number;
  runId: number;
  accountKey: string;
  fileName: string;
  displayAccount: string;
  authIndex?: string;
  accountId?: string;
  provider: string;
  disabled: boolean;
  status?: string;
  state?: string;
  action: string;
  actionReason: string;
  actionStatus?: string;
  executedAction?: string;
  actionError?: string;
  statusCode?: number;
  usedPercent?: number;
  isQuota: boolean;
  error?: string;
  createdAtMs: number;
}

export interface ModelPricesResponse {
  prices: Record<string, ModelPrice>;
}

export interface ModelPriceSyncCandidate {
  sourceModelId: string;
  score: number;
  reason: string;
  price: ModelPrice;
}

export interface ModelPriceSyncCandidateSet {
  model: string;
  candidates: ModelPriceSyncCandidate[];
}

export interface ModelPriceSyncSourceResult {
  source: string;
  models: number;
  skipped: number;
  error?: string;
}

export interface ModelPriceSyncResponse extends ModelPricesResponse {
  strategy?: string;
  scopeModels?: string[];
  source?: string;
  sources?: string[];
  imported: number;
  skipped: number;
  matched?: Record<string, ModelPrice>;
  candidates?: ModelPriceSyncCandidateSet[];
  unmatched?: string[];
  proxyUsed?: boolean;
  sourceResults?: ModelPriceSyncSourceResult[];
}

export interface ModelPriceSyncOptions {
  models?: string[];
  strategy?: 'selected' | 'credential_matches' | 'credentials';
}

export interface ApiKeyAlias {
  apiKeyHash: string;
  alias: string;
  updatedAtMs?: number;
}

export interface ApiKeyAliasesResponse {
  items: ApiKeyAlias[];
}

export interface UsageImportResponse {
  format?: string;
  added: number;
  skipped: number;
  total: number;
  failed: number;
  unsupported?: number;
  warnings?: string[];
}

export interface UsageExportResponse {
  blob: Blob;
  filename: string;
}

export interface UsageClearResponse {
  success?: boolean;
  removed?: boolean;
  reset?: boolean;
  [key: string]: unknown;
}

export interface DashboardSummaryWindow {
  today_start_ms: number;
  now_ms: number;
  rolling_30m_start_ms: number;
}

export interface DashboardTodaySummary {
  total_calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_write_tokens?: number;
  reasoning_tokens: number;
  total_tokens: number;
  total_cost: number;
  average_latency_ms: number | null;
  zero_token_calls: number;
}

export interface DashboardRollingSummary {
  rpm: number;
  tpm: number;
  total_calls: number;
  total_tokens: number;
}

export interface DashboardTopModel {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  success_rate: number;
}

export interface DashboardTrafficPoint {
  bucket_ms: number;
  calls: number;
  tokens: number;
  success: number;
  failure: number;
  calls_share: number;
  tokens_share: number;
  failure_rate: number;
}

export interface DashboardHourlyActivityPoint {
  hour_index: number;
  bucket_ms: number;
  calls: number;
  tokens: number;
  intensity: number;
}

export interface DashboardTodayRequestHealthTimelinePoint {
  bucket_ms: number;
  calls: number;
  tokens: number;
  success: number;
  failure: number;
  success_rate: number;
  failure_rate: number;
  tone: 'future' | 'empty' | 'good' | 'warn' | 'bad' | string;
  intensity: number;
  future: boolean;
}

export interface DashboardTodayRequestHealthTimeline {
  from_ms: number;
  to_ms: number;
  bucket_ms: number;
  success_calls: number;
  failure_calls: number;
  total_calls: number;
  success_rate: number;
  points: DashboardTodayRequestHealthTimelinePoint[];
}

export interface DashboardTokenMixSegment {
  key: 'input' | 'output' | 'reasoning' | 'cached' | 'cache_read' | 'cache_creation' | string;
  tokens: number;
  share: number;
}

export interface DashboardModelCostRank {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  success_rate: number;
  cost_share: number;
}

export interface DashboardChannelHealth {
  auth_index: string;
  auth_label?: string;
  account?: string;
  channel?: string;
  source?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  calls: number;
  failures: number;
  failure_rate: number;
  success_rate: number;
  tokens: number;
  cost: number;
  average_latency_ms: number | null;
  tone: 'good' | 'warn' | 'bad' | string;
}

export interface DashboardFailureSource {
  source_hash: string;
  auth_index: string;
  auth_label?: string;
  account?: string;
  channel?: string;
  source?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  calls: number;
  failures: number;
  failure_rate: number;
  last_seen_ms: number;
  average_latency_ms: number | null;
  tone: 'good' | 'warn' | 'bad' | string;
}

export interface DashboardRecentFailure {
  timestamp_ms: number;
  model: string;
  api_key_hash: string;
  source_hash: string;
  auth_index: string;
  auth_label?: string;
  account?: string;
  channel?: string;
  api_key_alias?: string;
  source?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_project_id_snapshot?: string;
  endpoint: string;
  duration_ms: number | null;
  fail_status_code?: number | null;
  fail_summary?: string;
}

export interface DashboardSummaryResponse {
  generated_at_ms: number;
  window: DashboardSummaryWindow;
  today: DashboardTodaySummary;
  rolling_30m: DashboardRollingSummary;
  top_models_today: DashboardTopModel[];
  model_cost_rank?: DashboardModelCostRank[];
  traffic_timeline?: DashboardTrafficPoint[];
  hourly_activity?: DashboardHourlyActivityPoint[];
  today_request_health_timeline?: DashboardTodayRequestHealthTimeline;
  token_mix?: DashboardTokenMixSegment[];
  channel_health?: DashboardChannelHealth[];
  failure_sources?: DashboardFailureSource[];
  recent_failures: DashboardRecentFailure[];
}

export interface DashboardSummaryParams {
  todayStartMs: number;
  nowMs?: number;
  topModels?: number;
  recentFailures?: number;
}

type DashboardMutableStats = {
  calls: number;
  success: number;
  failure: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  totalCost: number;
  zeroTokenCalls: number;
  latencyTotal: number;
  latencyCount: number;
};

type DashboardModelStats = DashboardMutableStats & {
  model: string;
};

type DashboardChannelStats = DashboardMutableStats & {
  authIndex: string;
  source: string;
  accountSnapshot?: string;
  authLabelSnapshot?: string;
  authProviderSnapshot?: string;
  lastSeenMs: number;
};

export interface MonitoringAnalyticsFilters {
  models?: string[];
  providers?: string[];
  accounts?: string[];
  credential_ids?: string[];
  auth_files?: string[];
  auth_indices?: string[];
  api_key_hashes?: string[];
  source_hashes?: string[];
  project_ids?: string[];
  request_types?: string[];
  header_error_kinds?: string[];
  header_error_codes?: string[];
  header_quota_plans?: string[];
  header_trace_ids?: string[];
  include_failed?: boolean;
  failed_only?: boolean;
  exclude_zero_token?: boolean;
  min_latency_ms?: number;
  cache_status?: string;
}

export interface MonitoringAnalyticsEventsPageRequest {
  limit?: number;
  before_ms?: number | null;
  before_id?: number | null;
  offset?: number;
  page?: number;
}

export interface MonitoringAnalyticsDrilldownPreviewRequest {
  from_ms: number;
  to_ms: number;
  limit?: number;
}

export interface MonitoringAnalyticsInclude {
  summary?: boolean;
  summary_profile?: 'full' | 'compact';
  summary_percentiles?: boolean;
  summary_comparison?: boolean;
  timeline?: boolean;
  hourly_distribution?: boolean;
  model_share?: boolean;
  channel_share?: boolean;
  model_stats?: boolean;
  failure_sources?: boolean;
  account_stats?: boolean;
  credential_stats?: boolean;
  credential_timeline?: boolean;
  api_key_stats?: boolean;
  filter_options?: boolean;
  filter_selectors?: boolean;
  heatmap?: boolean;
  anomaly_points?: boolean;
  task_buckets?: boolean;
  recent_failures?: number;
  events_page?: MonitoringAnalyticsEventsPageRequest;
  drilldown_preview?: MonitoringAnalyticsDrilldownPreviewRequest;
  granularity?: 'hour' | 'day' | string;
}

export interface MonitoringAnalyticsRequest {
  from_ms: number;
  to_ms: number;
  now_ms?: number;
  time_zone?: string;
  search_query?: string;
  search_api_key_hash?: string;
  filters?: MonitoringAnalyticsFilters;
  include?: MonitoringAnalyticsInclude;
}

export interface MonitoringAnalyticsSummary {
  total_calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_write_tokens?: number;
  cache_hit_rate?: number;
  reasoning_tokens: number;
  total_tokens: number;
  total_cost: number;
  average_cost_per_call?: number;
  average_latency_ms: number | null;
  p95_latency_ms?: number | null;
  p95_ttft_ms?: number | null;
  zero_token_calls: number;
  rpm_30m: number;
  tpm_30m: number;
  avg_daily_requests: number;
  avg_daily_tokens: number;
  approx_tasks: number;
  approx_task_failures: number;
  approx_task_success_rate: number;
  zero_token_models: string[];
}

export interface MonitoringAnalyticsSummaryComparison {
  from_ms: number;
  to_ms: number;
  total_calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  total_tokens: number;
  total_cost: number;
}

export interface MonitoringAnalyticsTimelinePoint {
  bucket_ms: number;
  bucket_end_ms?: number;
  label: string;
  calls: number;
  tokens: number;
  success: number;
  failure: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cache_hit_rate?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  cost?: number;
  average_latency_ms?: number | null;
  p95_latency_ms?: number | null;
  p95_ttft_ms?: number | null;
  success_rate?: number;
  failure_rate?: number;
}

export interface MonitoringAnalyticsHourlyPoint {
  hour: number;
  calls: number;
  tokens: number;
}

export interface MonitoringAnalyticsHeatmapContributor {
  key: string;
  label?: string;
  calls: number;
  success: number;
  failure: number;
  tokens: number;
  cost: number;
  failure_rate: number;
  share: number;
}

export interface MonitoringAnalyticsHeatmapPoint {
  weekday: number;
  hour: number;
  calls: number;
  success: number;
  failure: number;
  tokens: number;
  cost: number;
  failure_rate: number;
  model_contributors?: MonitoringAnalyticsHeatmapContributor[];
  api_key_contributors?: MonitoringAnalyticsHeatmapContributor[];
  provider_contributors?: MonitoringAnalyticsHeatmapContributor[];
}

export type MonitoringAnalyticsAnomalySeverity = 'low' | 'medium' | 'high' | string;

export interface MonitoringAnalyticsAnomalyPoint {
  bucket_ms: number;
  bucket_end_ms: number;
  label: string;
  severity: MonitoringAnalyticsAnomalySeverity;
  metric_keys: string[];
  calls: number;
  total_tokens: number;
  cost: number;
  failure_rate: number;
  request_change: number;
  cost_change: number;
  tokens_per_request_change: number;
  cache_hit_rate_change: number;
  failure_rate_change: number;
  latency_p95_change: number;
}

export interface MonitoringAnalyticsModelShareRow {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface MonitoringAnalyticsModelStat {
  model: string;
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_hit_tokens?: number;
  cache_hit_input_tokens?: number;
  cache_hit_rate?: number;
  total_tokens: number;
  cost: number;
}

export interface MonitoringAnalyticsChannelShareRow {
  auth_index: string;
  provider: string;
  source?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  calls: number;
  success: number;
  failure: number;
  tokens: number;
  cost: number;
  average_latency_ms: number | null;
}

export interface MonitoringAnalyticsFailureSourceRow {
  source?: string;
  source_hash: string;
  auth_index: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  calls: number;
  failure: number;
  last_seen_ms: number;
  average_latency_ms: number | null;
}

export interface MonitoringAnalyticsAccountModelStatRow {
  model: string;
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_hit_tokens?: number;
  cache_hit_input_tokens?: number;
  cache_hit_rate?: number;
  total_tokens: number;
  cost: number;
  last_seen_ms: number;
}

export interface MonitoringAnalyticsAccountStatRow {
  id: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_indices?: string[];
  sources?: string[];
  source_hashes?: string[];
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  cost: number;
  average_latency_ms: number | null;
  last_seen_ms: number;
  models?: MonitoringAnalyticsAccountModelStatRow[];
}

export interface MonitoringAnalyticsCredentialStatRow {
  id: string;
  auth_file_snapshot?: string;
  auth_index?: string;
  source?: string;
  source_hash?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_project_id_snapshot?: string;
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  cost: number;
  average_latency_ms: number | null;
  last_seen_ms: number;
  models?: MonitoringAnalyticsAccountModelStatRow[];
}

export interface MonitoringAnalyticsCredentialTimelinePoint {
  id: string;
  label?: string;
  auth_file_snapshot?: string;
  auth_index?: string;
  source?: string;
  source_hash?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_project_id_snapshot?: string;
  bucket_ms: number;
  bucket_label?: string;
  calls: number;
  tokens: number;
  success: number;
  failure: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  cost?: number;
  average_latency_ms?: number | null;
  success_rate?: number;
  failure_rate?: number;
}

export interface MonitoringAnalyticsApiKeyStatRow {
  id: string;
  api_key_hash: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_indices?: string[];
  sources?: string[];
  source_hashes?: string[];
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  cost: number;
  average_latency_ms: number | null;
  last_seen_ms: number;
  models?: MonitoringAnalyticsAccountModelStatRow[];
  contexts?: MonitoringAnalyticsApiKeyContextRow[];
}

export interface MonitoringAnalyticsApiKeyContextRow {
  id: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_index?: string;
  source?: string;
  source_hash?: string;
  calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  failure_rate: number;
  total_tokens: number;
  cost: number;
  average_latency_ms?: number | null;
  last_seen_ms: number;
}

export interface MonitoringAnalyticsFilterOptions {
  account_stats?: MonitoringAnalyticsAccountStatRow[];
  api_key_stats?: MonitoringAnalyticsApiKeyStatRow[];
  channel_share?: MonitoringAnalyticsChannelShareRow[];
  model_stats?: MonitoringAnalyticsModelStat[];
  models?: string[];
  api_key_hashes?: string[];
  providers?: string[];
  auth_files?: string[];
  project_ids?: string[];
  request_types?: string[];
  header_error_kinds?: string[];
  header_error_codes?: string[];
  header_quota_plans?: string[];
  header_trace_ids?: string[];
}

export interface MonitoringAnalyticsTaskBucketRow {
  bucket_key: string;
  total: number;
  success: number;
  failure: number;
  first_ms: number;
  last_ms: number;
  source: string;
  source_hash: string;
  auth_index: string;
  models: string[];
  endpoints: string[];
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  average_latency_ms: number | null;
  max_latency_ms: number | null;
}

export interface ResponseHeaderQuotaWindow {
  used_percent?: number;
  reset_at_ms?: number;
  reset_after_seconds?: number;
  window_minutes?: number;
}

export interface ResponseHeaderQuotaMetadata {
  plan_type?: string;
  active_limit?: string;
  rate_limit_reached_type?: string;
  summary_window_kind?: string;
  summary_window_source?: string;
  reached_window_kind?: string;
  reached_window_source?: string;
  credits_balance?: string;
  credits_has_credits?: boolean;
  credits_unlimited?: boolean;
  primary_over_secondary_limit_percent?: number;
  primary?: ResponseHeaderQuotaWindow;
  secondary?: ResponseHeaderQuotaWindow;
  recover_at_ms?: number;
  used_percent?: number;
}

export interface ResponseHeaderErrorMetadata {
  kind?: string;
  code?: string;
  authorization_error?: string;
  ide_error_code?: string;
  ide_root_error_code?: string;
  retry_after_seconds?: number;
  retry_after_recover_at_ms?: number;
  rate_limit_bypass?: string;
}

export interface ResponseHeaderTraceMetadata {
  primary_trace_id?: string;
  openai_request_id?: string;
  request_id?: string;
  oneapi_request_id?: string;
  cf_ray?: string;
  eagle_id?: string;
  cloud_ai_companion_trace_id?: string;
  client_request_id?: string;
  zeabur_request_id?: string;
}

export interface ResponseHeaderRoutingMetadata {
  openai_proxy_wasm?: string;
  models_etag?: string;
  new_api_version?: string;
  server?: string;
  via?: string;
  cf_cache_status?: string;
  site_cache_status?: string;
  served_by?: string;
  mife_upstream_status?: string;
}

export interface ResponseHeaderResponseMetadata {
  content_type?: string;
  content_length?: number;
  content_disposition?: string;
  server_timing?: string;
}

export interface ResponseHeaderProviderMetadata {
  antigravity_trace_id?: string;
  antigravity_server_timing?: string;
  mife_upstream_status?: string;
  oneapi_request_id?: string;
  cloudflare_ray?: string;
  cloudflare_cache_status?: string;
}

export interface ResponseHeaderMetadata {
  quota?: ResponseHeaderQuotaMetadata;
  errors?: ResponseHeaderErrorMetadata;
  trace?: ResponseHeaderTraceMetadata;
  routing?: ResponseHeaderRoutingMetadata;
  response?: ResponseHeaderResponseMetadata;
  providers?: ResponseHeaderProviderMetadata;
}

export interface UsageHeaderSnapshot {
  event_hash: string;
  timestamp_ms: number;
  auth_file_snapshot?: string;
  auth_index?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_project_id_snapshot?: string;
  source?: string;
  source_hash?: string;
  response_metadata?: ResponseHeaderMetadata;
  header_quota_recover_at_ms?: number | null;
  header_quota_used_percent?: number | null;
  header_quota_plan_type?: string;
  header_error_kind?: string;
  header_error_code?: string;
  header_trace_id?: string;
}

export interface UsageHeaderSnapshotsResponse {
  generated_at_ms: number;
  from_ms: number;
  to_ms: number;
  items: UsageHeaderSnapshot[];
}

export interface MonitoringAnalyticsRecentFailure {
  timestamp_ms: number;
  model: string;
  api_key_hash: string;
  source?: string;
  source_hash: string;
  auth_index: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_project_id_snapshot?: string;
  endpoint: string;
  duration_ms: number | null;
  fail_status_code?: number | null;
  fail_summary?: string;
  response_metadata?: ResponseHeaderMetadata;
  header_quota_recover_at_ms?: number | null;
  header_quota_used_percent?: number | null;
  header_quota_plan_type?: string;
  header_error_kind?: string;
  header_error_code?: string;
  header_trace_id?: string;
}

export interface MonitoringAnalyticsEventRow {
  request_id?: string;
  client_ip?: string;
  event_hash: string;
  timestamp_ms: number;
  model: string;
  endpoint: string;
  method: string;
  path: string;
  auth_index: string;
  source: string;
  source_hash: string;
  api_key_hash: string;
  account_snapshot: string;
  auth_label_snapshot: string;
  auth_file_snapshot?: string;
  provider: string;
  auth_provider_snapshot: string;
  auth_project_id_snapshot?: string;
  resolved_model?: string;
  reasoning_effort?: string;
  service_tier?: string;
  executor_type?: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_write_tokens?: number;
  reasoning_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  ttft_ms?: number | null;
  failed: boolean;
  fail_status_code?: number | null;
  fail_summary?: string;
  response_metadata?: ResponseHeaderMetadata;
  header_quota_recover_at_ms?: number | null;
  header_quota_used_percent?: number | null;
  header_quota_plan_type?: string;
  header_error_kind?: string;
  header_error_code?: string;
  header_trace_id?: string;
}

export interface MonitoringAnalyticsEventsResponse {
  items: MonitoringAnalyticsEventRow[];
  next_before_ms?: number;
  next_before_id?: number;
  has_more: boolean;
  total_count?: number;
}

export interface MonitoringAnalyticsResponse {
  generated_at_ms: number;
  granularity: 'hour' | 'day' | string;
  summary?: MonitoringAnalyticsSummary;
  summary_comparison?: MonitoringAnalyticsSummaryComparison;
  timeline?: MonitoringAnalyticsTimelinePoint[];
  hourly_distribution?: MonitoringAnalyticsHourlyPoint[];
  heatmap?: MonitoringAnalyticsHeatmapPoint[];
  anomaly_points?: MonitoringAnalyticsAnomalyPoint[];
  model_share?: MonitoringAnalyticsModelShareRow[];
  model_stats?: MonitoringAnalyticsModelStat[];
  channel_share?: MonitoringAnalyticsChannelShareRow[];
  failure_sources?: MonitoringAnalyticsFailureSourceRow[];
  account_stats?: MonitoringAnalyticsAccountStatRow[];
  credential_stats?: MonitoringAnalyticsCredentialStatRow[];
  credential_timeline?: MonitoringAnalyticsCredentialTimelinePoint[];
  api_key_stats?: MonitoringAnalyticsApiKeyStatRow[];
  filter_options?: MonitoringAnalyticsFilterOptions;
  task_buckets?: MonitoringAnalyticsTaskBucketRow[];
  recent_failures?: MonitoringAnalyticsRecentFailure[];
  events?: MonitoringAnalyticsEventsResponse;
  drilldown_preview?: MonitoringAnalyticsEventsResponse;
}

const USAGE_SERVICE_TIMEOUT_MS = 15 * 1000;
const USAGE_SERVICE_TRANSFER_TIMEOUT_MS = 60 * 1000;

const buildUrl = (base: string, path: string): string => {
  const normalized = normalizeApiBase(base).replace(/\/+$/, '');
  return `${normalized}${path}`;
};

const authHeaders = (managementKey?: string) =>
  managementKey ? { Authorization: `Bearer ${managementKey}` } : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const readUsageServiceErrorCode = (value: unknown): string => {
  if (!isRecord(value) || typeof value.code !== 'string') return '';
  return USAGE_SERVICE_ERROR_CODES.has(value.code) ? value.code : '';
};

const fallbackUsageServiceCodeByStatus = (status?: number): string => {
  switch (status) {
    case 401:
      return 'invalid_admin_key';
    case 405:
      return 'method_not_allowed';
    case 412:
      return 'usage_service_not_configured';
    default:
      return '';
  }
};

export const getUsageServiceErrorCode = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return (
      readUsageServiceErrorCode(error.response?.data) ||
      fallbackUsageServiceCodeByStatus(error.response?.status)
    );
  }

  if (!isRecord(error)) return '';
  const code = typeof error.code === 'string' ? error.code : '';
  if (USAGE_SERVICE_ERROR_CODES.has(code)) return code;
  return readUsageServiceErrorCode(error.data) || readUsageServiceErrorCode(error.details);
};

const readUsageServiceErrorMessage = (value: unknown): string => {
  if (!isRecord(value)) return '';
  if (typeof value.error === 'string') return value.error;
  if (typeof value.message === 'string') return value.message;
  return '';
};

const toUsageServiceApiError = (error: unknown): UsageServiceApiError => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const message =
      readUsageServiceErrorMessage(data) || error.message || 'Management API request failed';
    const apiError = new Error(message) as UsageServiceApiError;
    apiError.name = 'UsageServiceApiError';
    apiError.status = error.response?.status;
    apiError.code = getUsageServiceErrorCode(error) || error.code;
    apiError.details = data;
    apiError.data = data;
    return apiError;
  }

  if (error instanceof Error) return error as UsageServiceApiError;
  const fallback = new Error(
    typeof error === 'string' ? error : 'Management API request failed'
  ) as UsageServiceApiError;
  fallback.name = 'UsageServiceApiError';
  return fallback;
};

const withUsageServiceError = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw toUsageServiceApiError(error);
  }
};

const readHeader = (headers: unknown, name: string): string => {
  if (!headers || typeof headers !== 'object') return '';
  const getter = (headers as { get?: (key: string) => unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    return value === undefined || value === null ? '' : String(value);
  }
  const target = name.toLowerCase();
  const entries = Object.entries(headers as Record<string, unknown>);
  const match = entries.find(([key]) => key.toLowerCase() === target);
  return match?.[1] === undefined || match?.[1] === null ? '' : String(match[1]);
};

const parseContentDispositionFilename = (value: string): string => {
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = value.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() || '';
};

export const usageServiceApi = {
  getStatus: async (base: string, managementKey?: string): Promise<UsageServiceStatus> => {
    return withUsageServiceError(async () => {
      const usageResponse = await axios.get<UsagePayload>(buildUrl(base, '/v0/management/usage'), {
        timeout: USAGE_SERVICE_TIMEOUT_MS,
        headers: authHeaders(managementKey),
      });
      const usage = isRecord(usageResponse.data?.usage)
        ? (usageResponse.data.usage as UsagePayload)
        : usageResponse.data;
      const totalRequests = toDashboardNumber(usage.total_requests);
      const failureCount = toDashboardNumber(usage.failure_count);
      return {
        service: 'cliproxyapi-native',
        events: totalRequests,
        deadLetters: 0,
        collector: {
          collector: 'native',
          mode: 'built-in',
          transport: 'management-api',
          queue: 'in-memory',
          totalInserted: totalRequests,
          totalSkipped: failureCount,
        },
      };
    });
  },

  getUsage: async (
    base: string,
    managementKey?: string,
    options: UsageRequestOptions = {}
  ): Promise<UsagePayload> => {
    return withUsageServiceError(async () => {
      const response = await axios.get<UsagePayload>(buildUrl(base, '/v0/management/usage'), {
        timeout: USAGE_SERVICE_TIMEOUT_MS,
        headers: authHeaders(managementKey),
        params: options.includeDetails ? { details: 1 } : undefined,
      });
      return response.data;
    });
  },

  clearUsage: async (base: string, managementKey?: string): Promise<UsageClearResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.delete<UsageClearResponse>(
        buildUrl(base, '/v0/management/usage'),
        {
          timeout: USAGE_SERVICE_TRANSFER_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  getModelPrices: async (base: string, managementKey?: string): Promise<ModelPricesResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.get<ModelPricesResponse>(
        buildUrl(base, '/v0/management/model-prices'),
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  saveModelPrices: async (
    base: string,
    prices: Record<string, ModelPrice>,
    managementKey?: string
  ): Promise<ModelPricesResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.put<ModelPricesResponse>(
        buildUrl(base, '/v0/management/model-prices'),
        { prices },
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  getApiKeyAliases: async (
    base: string,
    managementKey?: string
  ): Promise<ApiKeyAliasesResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.get<ApiKeyAliasesResponse>(
        buildUrl(base, '/v0/management/api-key-aliases'),
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  saveApiKeyAliases: async (
    base: string,
    items: ApiKeyAlias[],
    managementKey?: string,
    activeApiKeyHashes?: string[],
    allowOrphanAliasCleanup?: boolean
  ): Promise<ApiKeyAliasesResponse> => {
    return withUsageServiceError(async () => {
      const body: {
        items: ApiKeyAlias[];
        activeApiKeyHashes?: string[];
        allowOrphanAliasCleanup?: boolean;
      } = { items };
      if (activeApiKeyHashes && activeApiKeyHashes.length > 0) {
        body.activeApiKeyHashes = activeApiKeyHashes;
      }
      if (allowOrphanAliasCleanup) {
        body.allowOrphanAliasCleanup = true;
      }
      const response = await axios.put<ApiKeyAliasesResponse>(
        buildUrl(base, '/v0/management/api-key-aliases'),
        body,
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  deleteApiKeyAlias: async (
    base: string,
    apiKeyHash: string,
    managementKey?: string
  ): Promise<void> => {
    await withUsageServiceError(async () => {
      await axios.delete(
        buildUrl(base, `/v0/management/api-key-aliases/${encodeURIComponent(apiKeyHash)}`),
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
    });
  },

  syncModelPrices: async (
    base: string,
    managementKey?: string,
    modelsOrOptions?: string[] | ModelPriceSyncOptions
  ): Promise<ModelPriceSyncResponse> => {
    return withUsageServiceError(async () => {
      const body = Array.isArray(modelsOrOptions)
        ? { models: modelsOrOptions }
        : {
            models: modelsOrOptions?.models,
            strategy: modelsOrOptions?.strategy,
          };
      const response = await axios.post<ModelPriceSyncResponse>(
        buildUrl(base, '/v0/management/model-prices/sync'),
        body,
        {
          timeout: 30 * 1000,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },

  exportUsage: async (base: string, managementKey?: string): Promise<UsageExportResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.get<Blob>(buildUrl(base, '/v0/management/usage/export'), {
        timeout: USAGE_SERVICE_TRANSFER_TIMEOUT_MS,
        headers: authHeaders(managementKey),
        responseType: 'blob',
      });
      const contentDisposition = readHeader(response.headers, 'content-disposition');
      return {
        blob: response.data,
        filename: parseContentDispositionFilename(contentDisposition) || 'usage-snapshot.json',
      };
    });
  },

  importUsage: async (
    base: string,
    payload: Blob | string,
    managementKey?: string
  ): Promise<UsageImportResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.post<UsageImportResponse>(
        buildUrl(base, '/v0/management/usage/import'),
        payload,
        {
          timeout: USAGE_SERVICE_TRANSFER_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },
};

const toDashboardNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createDashboardStats = (): DashboardMutableStats => ({
  calls: 0,
  success: 0,
  failure: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  zeroTokenCalls: 0,
  latencyTotal: 0,
  latencyCount: 0,
});

const addDetailToStats = (
  stats: DashboardMutableStats,
  detail: UsageDetailWithEndpoint,
  cost: number
) => {
  const tokens = detail.tokens ?? {};
  const inputTokens = Math.max(toDashboardNumber(tokens.input_tokens), 0);
  const outputTokens = Math.max(toDashboardNumber(tokens.output_tokens), 0);
  const cachedTokens = Math.max(toDashboardNumber(tokens.cached_tokens ?? tokens.cache_tokens), 0);
  const cacheReadTokens = Math.max(toDashboardNumber(tokens.cache_read_tokens), cachedTokens, 0);
  const splitCacheCreationTokens =
    Math.max(toDashboardNumber(tokens.cache_creation_tokens_5m), 0) +
    Math.max(toDashboardNumber(tokens.cache_creation_tokens_1h), 0);
  const cacheCreationTokens = Math.max(
    splitCacheCreationTokens ||
      toDashboardNumber(tokens.cache_write_tokens) ||
      toDashboardNumber(tokens.cache_creation_tokens),
    0
  );
  const reasoningTokens = Math.max(toDashboardNumber(tokens.reasoning_tokens), 0);
  const totalTokens = Math.max(
    toDashboardNumber(tokens.total_tokens) ||
      inputTokens +
        outputTokens +
        cachedTokens +
        cacheReadTokens +
        cacheCreationTokens +
        reasoningTokens,
    0
  );
  const latencyMs = toDashboardNumber(detail.latency_ms);

  stats.calls += 1;
  if (detail.failed) {
    stats.failure += 1;
  } else {
    stats.success += 1;
  }
  stats.inputTokens += inputTokens;
  stats.outputTokens += outputTokens;
  stats.cachedTokens += cachedTokens;
  stats.cacheReadTokens += cacheReadTokens;
  stats.cacheCreationTokens += cacheCreationTokens;
  stats.reasoningTokens += reasoningTokens;
  stats.totalTokens += totalTokens;
  stats.totalCost += cost;
  if (totalTokens <= 0) stats.zeroTokenCalls += 1;
  if (latencyMs > 0) {
    stats.latencyTotal += latencyMs;
    stats.latencyCount += 1;
  }
};

const averageLatency = (stats: DashboardMutableStats): number | null =>
  stats.latencyCount > 0 ? stats.latencyTotal / stats.latencyCount : null;

const successRate = (stats: DashboardMutableStats): number =>
  stats.calls > 0 ? stats.success / stats.calls : 0;

const failureRate = (stats: DashboardMutableStats): number =>
  stats.calls > 0 ? stats.failure / stats.calls : 0;

const getDashboardTone = (rate: number): 'good' | 'warn' | 'bad' => {
  if (rate >= 0.98) return 'good';
  if (rate >= 0.9) return 'warn';
  return 'bad';
};

const toDashboardTodaySummary = (stats: DashboardMutableStats): DashboardTodaySummary => ({
  total_calls: stats.calls,
  success_calls: stats.success,
  failure_calls: stats.failure,
  success_rate: successRate(stats),
  input_tokens: stats.inputTokens,
  output_tokens: stats.outputTokens,
  cached_tokens: stats.cachedTokens,
  cache_read_tokens: stats.cacheReadTokens,
  cache_creation_tokens: stats.cacheCreationTokens,
  cache_write_tokens: stats.cacheCreationTokens,
  reasoning_tokens: stats.reasoningTokens,
  total_tokens: stats.totalTokens,
  total_cost: stats.totalCost,
  average_latency_ms: averageLatency(stats),
  zero_token_calls: stats.zeroTokenCalls,
});

const buildTrafficTimeline = (
  details: UsageDetailWithEndpoint[],
  todayStartMs: number,
  nowMs: number
): DashboardTrafficPoint[] => {
  const bucketCount = 24;
  const bucketSizeMs = 60 * 60 * 1000;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket_ms: todayStartMs + index * bucketSizeMs,
    calls: 0,
    tokens: 0,
    success: 0,
    failure: 0,
  }));

  details.forEach((detail) => {
    const timestampMs = detail.__timestampMs;
    if (timestampMs < todayStartMs || timestampMs > nowMs) return;
    const index = Math.floor((timestampMs - todayStartMs) / bucketSizeMs);
    const bucket = buckets[index];
    if (!bucket) return;
    bucket.calls += 1;
    bucket.tokens += Math.max(toDashboardNumber(detail.tokens?.total_tokens), 0);
    if (detail.failed) {
      bucket.failure += 1;
    } else {
      bucket.success += 1;
    }
  });

  const maxCalls = Math.max(...buckets.map((bucket) => bucket.calls), 0);
  const maxTokens = Math.max(...buckets.map((bucket) => bucket.tokens), 0);
  return buckets.map((bucket) => ({
    ...bucket,
    calls_share: maxCalls > 0 ? bucket.calls / maxCalls : 0,
    tokens_share: maxTokens > 0 ? bucket.tokens / maxTokens : 0,
    failure_rate: bucket.calls > 0 ? bucket.failure / bucket.calls : 0,
  }));
};

const buildRequestHealthTimeline = (
  details: UsageDetailWithEndpoint[],
  todayStartMs: number,
  nowMs: number
): DashboardTodayRequestHealthTimeline => {
  const bucketMs = 10 * 60 * 1000;
  const bucketCount = 24 * 6;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket_ms: todayStartMs + index * bucketMs,
    calls: 0,
    tokens: 0,
    success: 0,
    failure: 0,
  }));

  details.forEach((detail) => {
    const timestampMs = detail.__timestampMs;
    if (timestampMs < todayStartMs || timestampMs > nowMs) return;
    const index = Math.floor((timestampMs - todayStartMs) / bucketMs);
    const bucket = buckets[index];
    if (!bucket) return;
    bucket.calls += 1;
    bucket.tokens += Math.max(toDashboardNumber(detail.tokens?.total_tokens), 0);
    if (detail.failed) {
      bucket.failure += 1;
    } else {
      bucket.success += 1;
    }
  });

  const maxCalls = Math.max(...buckets.map((bucket) => bucket.calls), 1);
  const points = buckets.map((bucket): DashboardTodayRequestHealthTimelinePoint => {
    const future = bucket.bucket_ms > nowMs;
    const success_rate = bucket.calls > 0 ? bucket.success / bucket.calls : 0;
    const failure_rate = bucket.calls > 0 ? bucket.failure / bucket.calls : 0;
    return {
      ...bucket,
      success_rate,
      failure_rate,
      tone: future ? 'future' : bucket.calls === 0 ? 'empty' : getDashboardTone(success_rate),
      intensity: bucket.calls > 0 ? Math.max(bucket.calls / maxCalls, 0.18) : 0,
      future,
    };
  });
  const totalStats = createDashboardStats();
  details.forEach((detail) => {
    if (detail.__timestampMs >= todayStartMs && detail.__timestampMs <= nowMs) {
      addDetailToStats(totalStats, detail, 0);
    }
  });

  return {
    from_ms: todayStartMs,
    to_ms: todayStartMs + 24 * 60 * 60 * 1000,
    bucket_ms: bucketMs,
    success_calls: totalStats.success,
    failure_calls: totalStats.failure,
    total_calls: totalStats.calls,
    success_rate: successRate(totalStats),
    points,
  };
};

const buildFallbackDashboardSummary = (
  payload: UsagePayload,
  params: DashboardSummaryParams
): DashboardSummaryResponse => {
  const nowMs = params.nowMs ?? Date.now();
  const todayStartMs = params.todayStartMs;
  const modelPrices = loadModelPrices();
  const allDetails = collectUsageDetailsWithEndpoint(payload).filter(
    (detail) => detail.__timestampMs > 0
  );
  const todayDetails = allDetails.filter(
    (detail) => detail.__timestampMs >= todayStartMs && detail.__timestampMs <= nowMs
  );
  const rollingStartMs = nowMs - 30 * 60 * 1000;
  const rollingDetails = allDetails.filter(
    (detail) => detail.__timestampMs >= rollingStartMs && detail.__timestampMs <= nowMs
  );
  const todayStats = createDashboardStats();
  const rollingStats = createDashboardStats();
  const modelStats = new Map<string, DashboardModelStats>();
  const channelStats = new Map<string, DashboardChannelStats>();

  todayDetails.forEach((detail) => {
    const cost = calculateCost(detail, modelPrices);
    addDetailToStats(todayStats, detail, cost);

    const model = detail.__resolvedModel || detail.__modelName || 'unknown';
    const currentModel =
      modelStats.get(model) ||
      ({
        ...createDashboardStats(),
        model,
      } satisfies DashboardModelStats);
    addDetailToStats(currentModel, detail, cost);
    modelStats.set(model, currentModel);

    const authIndex = String(detail.auth_index ?? '-').trim() || '-';
    const currentChannel =
      channelStats.get(authIndex) ||
      ({
        ...createDashboardStats(),
        authIndex,
        source: detail.source || '',
        accountSnapshot: detail.account_snapshot,
        authLabelSnapshot: detail.auth_label_snapshot || detail.auth_file_snapshot,
        authProviderSnapshot: detail.auth_provider_snapshot,
        lastSeenMs: 0,
      } satisfies DashboardChannelStats);
    addDetailToStats(currentChannel, detail, cost);
    if (detail.__timestampMs > currentChannel.lastSeenMs) {
      currentChannel.lastSeenMs = detail.__timestampMs;
      currentChannel.source = detail.source || currentChannel.source;
      currentChannel.accountSnapshot = detail.account_snapshot || currentChannel.accountSnapshot;
      currentChannel.authLabelSnapshot =
        detail.auth_label_snapshot || detail.auth_file_snapshot || currentChannel.authLabelSnapshot;
      currentChannel.authProviderSnapshot =
        detail.auth_provider_snapshot || currentChannel.authProviderSnapshot;
    }
    channelStats.set(authIndex, currentChannel);
  });

  rollingDetails.forEach((detail) => {
    addDetailToStats(rollingStats, detail, 0);
  });

  const topLimit = params.topModels ?? 5;
  const topModels: DashboardTopModel[] = [...modelStats.values()]
    .sort((left, right) => right.totalTokens - left.totalTokens || right.calls - left.calls)
    .slice(0, topLimit)
    .map((model) => ({
      model: model.model,
      calls: model.calls,
      tokens: model.totalTokens,
      cost: model.totalCost,
      success_rate: successRate(model),
    }));
  const maxModelCost = Math.max(...[...modelStats.values()].map((model) => model.totalCost), 0);
  const modelCostRank: DashboardModelCostRank[] = [...modelStats.values()]
    .sort((left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens)
    .slice(0, topLimit)
    .map((model) => ({
      model: model.model,
      calls: model.calls,
      tokens: model.totalTokens,
      cost: model.totalCost,
      success_rate: successRate(model),
      cost_share: maxModelCost > 0 ? model.totalCost / maxModelCost : 0,
    }));
  const channelHealth: DashboardChannelHealth[] = [...channelStats.values()]
    .sort((left, right) => right.failure - left.failure || right.calls - left.calls)
    .slice(0, 8)
    .map((channel) => {
      const rate = successRate(channel);
      return {
        auth_index: channel.authIndex,
        auth_label: channel.authLabelSnapshot,
        account: channel.accountSnapshot,
        channel: channel.authProviderSnapshot,
        source: channel.source,
        account_snapshot: channel.accountSnapshot,
        auth_label_snapshot: channel.authLabelSnapshot,
        auth_provider_snapshot: channel.authProviderSnapshot,
        calls: channel.calls,
        failures: channel.failure,
        failure_rate: failureRate(channel),
        success_rate: rate,
        tokens: channel.totalTokens,
        cost: channel.totalCost,
        average_latency_ms: averageLatency(channel),
        tone: getDashboardTone(rate),
      };
    });
  const failureSources: DashboardFailureSource[] = channelHealth
    .filter((channel) => channel.failures > 0)
    .map((channel) => ({
      source_hash: channel.source || channel.auth_index,
      auth_index: channel.auth_index,
      auth_label: channel.auth_label,
      account: channel.account,
      channel: channel.channel,
      source: channel.source,
      account_snapshot: channel.account_snapshot,
      auth_label_snapshot: channel.auth_label_snapshot,
      auth_provider_snapshot: channel.auth_provider_snapshot,
      calls: channel.calls,
      failures: channel.failures,
      failure_rate: channel.failure_rate,
      last_seen_ms: nowMs,
      average_latency_ms: channel.average_latency_ms,
      tone: channel.tone,
    }));
  const recentFailures: DashboardRecentFailure[] = todayDetails
    .filter((detail) => detail.failed)
    .sort((left, right) => right.__timestampMs - left.__timestampMs)
    .slice(0, params.recentFailures ?? 5)
    .map((detail) => ({
      timestamp_ms: detail.__timestampMs,
      model: detail.__resolvedModel || detail.__modelName || 'unknown',
      api_key_hash: detail.api_key_hash || '',
      source_hash: detail.source || '',
      auth_index: String(detail.auth_index ?? '-'),
      auth_label: detail.auth_label_snapshot || detail.auth_file_snapshot,
      account: detail.account_snapshot,
      channel: detail.auth_provider_snapshot,
      source: detail.source,
      account_snapshot: detail.account_snapshot,
      auth_label_snapshot: detail.auth_label_snapshot || detail.auth_file_snapshot,
      auth_provider_snapshot: detail.auth_provider_snapshot,
      auth_project_id_snapshot: detail.auth_project_id_snapshot,
      endpoint: detail.__endpoint,
      duration_ms: detail.latency_ms ?? null,
      fail_status_code: detail.fail_status_code ?? null,
      fail_summary: detail.fail_summary || detail.fail_body,
    }));

  const totalTokenSegments = [
    { key: 'input', tokens: todayStats.inputTokens },
    { key: 'output', tokens: todayStats.outputTokens },
    { key: 'reasoning', tokens: todayStats.reasoningTokens },
    { key: 'cached', tokens: todayStats.cachedTokens },
    { key: 'cache_read', tokens: todayStats.cacheReadTokens },
    { key: 'cache_creation', tokens: todayStats.cacheCreationTokens },
  ];
  const tokenSegmentTotal = totalTokenSegments.reduce((sum, item) => sum + item.tokens, 0);

  return {
    generated_at_ms: nowMs,
    window: {
      today_start_ms: todayStartMs,
      now_ms: nowMs,
      rolling_30m_start_ms: rollingStartMs,
    },
    today: toDashboardTodaySummary(todayStats),
    rolling_30m: {
      rpm: rollingStats.calls / 30,
      tpm: rollingStats.totalTokens / 30,
      total_calls: rollingStats.calls,
      total_tokens: rollingStats.totalTokens,
    },
    top_models_today: topModels,
    model_cost_rank: modelCostRank,
    traffic_timeline: buildTrafficTimeline(todayDetails, todayStartMs, nowMs),
    hourly_activity: [],
    today_request_health_timeline: buildRequestHealthTimeline(todayDetails, todayStartMs, nowMs),
    token_mix: totalTokenSegments.map((segment) => ({
      key: segment.key,
      tokens: segment.tokens,
      share: tokenSegmentTotal > 0 ? segment.tokens / tokenSegmentTotal : 0,
    })),
    channel_health: channelHealth,
    failure_sources: failureSources,
    recent_failures: recentFailures,
  };
};

type MonitoringGroupStats = DashboardMutableStats & {
  id: string;
  provider: string;
  authIndices: Set<string>;
  sources: Set<string>;
  sourceHashes: Set<string>;
  accountSnapshot?: string;
  authLabelSnapshot?: string;
  authProviderSnapshot?: string;
  authProjectIdSnapshot?: string;
  lastSeenMs: number;
  models: Map<string, MonitoringModelGroupStats>;
};

type MonitoringModelGroupStats = DashboardMutableStats & {
  model: string;
  lastSeenMs: number;
};

const createMonitoringGroupStats = (id: string): MonitoringGroupStats => ({
  ...createDashboardStats(),
  id,
  provider: '',
  authIndices: new Set(),
  sources: new Set(),
  sourceHashes: new Set(),
  lastSeenMs: 0,
  models: new Map(),
});

const createMonitoringModelGroupStats = (model: string): MonitoringModelGroupStats => ({
  ...createDashboardStats(),
  model,
  lastSeenMs: 0,
});

const unwrapUsagePayload = (payload: UsagePayload): UsagePayload =>
  isRecord(payload?.usage) ? (payload.usage as UsagePayload) : payload;

const monitoringText = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim();

const monitoringLower = (value: unknown): string => monitoringText(value).toLowerCase();

const getMonitoringModel = (detail: UsageDetailWithEndpoint): string =>
  monitoringText(detail.__resolvedModel || detail.__modelName) || 'unknown';

const getMonitoringAuthIndex = (detail: UsageDetailWithEndpoint): string =>
  monitoringText(detail.auth_index) || '-';

const getMonitoringApiKeyHash = (detail: UsageDetailWithEndpoint): string =>
  monitoringLower(detail.api_key_hash || detail.__endpoint);

const getMonitoringSourceHash = (detail: UsageDetailWithEndpoint): string =>
  monitoringText(detail.source || detail.auth_index || detail.api_key_hash || detail.__endpoint) ||
  '-';

const getMonitoringAccountId = (detail: UsageDetailWithEndpoint): string =>
  monitoringText(
    detail.account_snapshot ||
      detail.auth_label_snapshot ||
      detail.auth_file_snapshot ||
      detail.source ||
      detail.auth_index ||
      detail.api_key_hash ||
      detail.__endpoint
  ) || '-';

const getMonitoringTotalTokens = (detail: UsageDetailWithEndpoint): number =>
  Math.max(toDashboardNumber(detail.tokens?.total_tokens), 0);

const matchesMonitoringValues = (
  filters: string[] | undefined,
  values: Array<string | null | undefined>,
  lower = false
): boolean => {
  if (!filters || filters.length === 0) return true;
  const candidates = new Set(
    values.map((value) => (lower ? monitoringLower(value) : monitoringText(value))).filter(Boolean)
  );
  return filters.some((filter) =>
    candidates.has(lower ? monitoringLower(filter) : monitoringText(filter))
  );
};

const detailMatchesMonitoringSearch = (
  detail: UsageDetailWithEndpoint,
  searchQuery?: string,
  searchApiKeyHash?: string
): boolean => {
  const normalizedQuery = monitoringLower(searchQuery);
  const normalizedApiKeyHash = monitoringLower(searchApiKeyHash);
  const apiKeyHash = getMonitoringApiKeyHash(detail);
  if (normalizedApiKeyHash && apiKeyHash !== normalizedApiKeyHash) return false;
  if (!normalizedQuery) return true;

  const searchText = [
    detail.__modelName,
    detail.__resolvedModel,
    detail.__endpoint,
    detail.__endpointMethod,
    detail.__endpointPath,
    detail.source,
    detail.auth_index,
    detail.api_key_hash,
    detail.account_snapshot,
    detail.auth_label_snapshot,
    detail.auth_file_snapshot,
    detail.auth_provider_snapshot,
    detail.auth_project_id_snapshot,
    detail.reasoning_effort,
    detail.service_tier,
    detail.executor_type,
    detail.fail_status_code,
    detail.fail_summary,
    detail.fail_body,
  ]
    .map(monitoringLower)
    .filter(Boolean)
    .join(' ');
  return searchText.includes(normalizedQuery);
};

const filterMonitoringDetails = (
  details: UsageDetailWithEndpoint[],
  request: MonitoringAnalyticsRequest,
  applyScopeFilters: boolean
): UsageDetailWithEndpoint[] => {
  const filters = applyScopeFilters ? request.filters : undefined;
  return details.filter((detail) => {
    if (detail.__timestampMs < request.from_ms || detail.__timestampMs > request.to_ms)
      return false;
    if (!detailMatchesMonitoringSearch(detail, request.search_query, request.search_api_key_hash)) {
      return false;
    }
    if (!filters) return true;

    if (filters.include_failed === false && detail.failed) return false;
    if (filters.failed_only === true && !detail.failed) return false;
    if (filters.exclude_zero_token === true && getMonitoringTotalTokens(detail) <= 0) return false;
    if (!matchesMonitoringValues(filters.models, [detail.__modelName, detail.__resolvedModel])) {
      return false;
    }
    if (
      !matchesMonitoringValues(filters.providers, [
        detail.auth_provider_snapshot,
        detail.executor_type,
      ])
    ) {
      return false;
    }
    if (
      !matchesMonitoringValues(filters.accounts, [
        detail.account_snapshot,
        detail.auth_label_snapshot,
        detail.auth_file_snapshot,
        detail.source,
        monitoringText(detail.auth_index),
      ])
    ) {
      return false;
    }
    if (!matchesMonitoringValues(filters.auth_indices, [getMonitoringAuthIndex(detail)])) {
      return false;
    }
    if (!matchesMonitoringValues(filters.api_key_hashes, [getMonitoringApiKeyHash(detail)], true)) {
      return false;
    }
    if (
      !matchesMonitoringValues(filters.source_hashes, [
        getMonitoringSourceHash(detail),
        detail.source,
        monitoringText(detail.auth_index),
        detail.api_key_hash,
      ])
    ) {
      return false;
    }
    return true;
  });
};

const addDetailToMonitoringGroupStats = (
  group: MonitoringGroupStats,
  detail: UsageDetailWithEndpoint,
  cost: number
) => {
  addDetailToStats(group, detail, cost);
  const model = getMonitoringModel(detail);
  const modelGroup = group.models.get(model) || createMonitoringModelGroupStats(model);
  addDetailToStats(modelGroup, detail, cost);
  modelGroup.lastSeenMs = Math.max(modelGroup.lastSeenMs, detail.__timestampMs);
  group.models.set(model, modelGroup);
  group.authIndices.add(getMonitoringAuthIndex(detail));
  group.sources.add(monitoringText(detail.source));
  group.sourceHashes.add(getMonitoringSourceHash(detail));
  group.provider = monitoringText(detail.provider);
  group.accountSnapshot = monitoringText(detail.account_snapshot) || group.accountSnapshot;
  group.authLabelSnapshot =
    monitoringText(detail.auth_label_snapshot || detail.auth_file_snapshot) ||
    group.authLabelSnapshot;
  group.authProviderSnapshot =
    monitoringText(detail.auth_provider_snapshot) || group.authProviderSnapshot;
  group.authProjectIdSnapshot =
    monitoringText(detail.auth_project_id_snapshot) || group.authProjectIdSnapshot;
  group.lastSeenMs = Math.max(group.lastSeenMs, detail.__timestampMs);
};

const toMonitoringModelSpendRows = (
  modelStats: Map<string, MonitoringModelGroupStats>
): MonitoringAnalyticsAccountModelStatRow[] =>
  [...modelStats.values()]
    .sort((left, right) => right.totalTokens - left.totalTokens || right.calls - left.calls)
    .map((model) => ({
      model: model.model,
      calls: model.calls,
      success_calls: model.success,
      failure_calls: model.failure,
      success_rate: successRate(model),
      input_tokens: model.inputTokens,
      output_tokens: model.outputTokens,
      cached_tokens: model.cachedTokens,
      cache_read_tokens: model.cacheReadTokens,
      cache_creation_tokens: model.cacheCreationTokens,
      total_tokens: model.totalTokens,
      cost: model.totalCost,
      last_seen_ms: model.lastSeenMs,
    }));

const buildMonitoringStats = (details: UsageDetailWithEndpoint[]): DashboardMutableStats => {
  const stats = createDashboardStats();
  const modelPrices = loadModelPrices();
  details.forEach((detail) => addDetailToStats(stats, detail, calculateCost(detail, modelPrices)));
  return stats;
};

const buildFallbackMonitoringTimeline = (
  details: UsageDetailWithEndpoint[],
  granularity: 'hour' | 'day' | string
): MonitoringAnalyticsTimelinePoint[] => {
  const buckets = new Map<
    number,
    { calls: number; tokens: number; success: number; failure: number }
  >();
  details.forEach((detail) => {
    const date = new Date(detail.__timestampMs);
    if (granularity === 'hour') {
      date.setMinutes(0, 0, 0);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    const bucketMs = date.getTime();
    const bucket = buckets.get(bucketMs) || { calls: 0, tokens: 0, success: 0, failure: 0 };
    bucket.calls += 1;
    bucket.tokens += getMonitoringTotalTokens(detail);
    if (detail.failed) bucket.failure += 1;
    else bucket.success += 1;
    buckets.set(bucketMs, bucket);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketMs, bucket]) => ({
      bucket_ms: bucketMs,
      label: new Date(bucketMs).toISOString(),
      calls: bucket.calls,
      tokens: bucket.tokens,
      success: bucket.success,
      failure: bucket.failure,
    }));
};

const buildFallbackMonitoringHourlyDistribution = (
  details: UsageDetailWithEndpoint[]
): MonitoringAnalyticsHourlyPoint[] => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0, tokens: 0 }));
  details.forEach((detail) => {
    const hour = new Date(detail.__timestampMs).getHours();
    const bucket = buckets[hour];
    if (!bucket) return;
    bucket.calls += 1;
    bucket.tokens += getMonitoringTotalTokens(detail);
  });
  return buckets;
};

const buildFallbackMonitoringEventIdentity = (detail: UsageDetailWithEndpoint): string => {
  const method = monitoringText(detail.__endpointMethod);
  const path = monitoringText(detail.__endpointPath);
  const endpoint = monitoringText(detail.__endpoint) || [method, path].filter(Boolean).join(' ');
  const tokens = detail.tokens ?? {};
  return [
    detail.__timestampMs,
    monitoringText(detail.__modelName) || getMonitoringModel(detail),
    endpoint,
    getMonitoringApiKeyHash(detail),
    getMonitoringSourceHash(detail),
    getMonitoringAuthIndex(detail),
    monitoringText(detail.reasoning_effort),
    toDashboardNumber(detail.latency_ms),
    toDashboardNumber(detail.ttft_ms),
    toDashboardNumber(tokens.input_tokens),
    toDashboardNumber(tokens.output_tokens),
    toDashboardNumber(tokens.cached_tokens ?? tokens.cache_tokens),
    toDashboardNumber(tokens.cache_read_tokens),
    toDashboardNumber(tokens.cache_creation_tokens),
    toDashboardNumber(tokens.cache_creation_tokens_5m),
    toDashboardNumber(tokens.cache_creation_tokens_1h),
    toDashboardNumber(tokens.cache_write_tokens),
    toDashboardNumber(tokens.reasoning_tokens),
    toDashboardNumber(tokens.total_tokens),
    detail.failed === true ? 1 : 0,
    detail.fail_status_code ?? '',
    monitoringText(detail.fail_summary || detail.fail_body),
  ].join('|');
};

const buildFallbackMonitoringEvents = (
  details: UsageDetailWithEndpoint[],
  request: MonitoringAnalyticsRequest
): MonitoringAnalyticsEventsResponse => {
  const limit = Math.max(
    Math.min(toDashboardNumber(request.include?.events_page?.limit) || 500, 1000),
    1
  );
  const page = Math.max(toDashboardNumber(request.include?.events_page?.page) || 1, 1);
  const offset = Math.max(
    toDashboardNumber(request.include?.events_page?.offset) || (page - 1) * limit,
    0
  );
  const occurrenceCounts = new Map<string, number>();
  const sorted = details
    .map((detail, originalIndex) => ({ detail, originalIndex }))
    .sort(
      (left, right) =>
        right.detail.__timestampMs - left.detail.__timestampMs ||
        left.originalIndex - right.originalIndex
    )
    .map((entry, cursorId) => {
      const identity = buildFallbackMonitoringEventIdentity(entry.detail);
      const occurrence = occurrenceCounts.get(identity) ?? 0;
      occurrenceCounts.set(identity, occurrence + 1);
      return {
        ...entry,
        cursorId,
        eventHash: occurrence > 0 ? `${identity}|#${occurrence}` : identity,
      };
    });
  const candidates = sorted;
  const pageItems = candidates.slice(offset, offset + limit);
  const items = pageItems.map((entry): MonitoringAnalyticsEventRow => {
    const { detail } = entry;
    const tokens = detail.tokens ?? {};
    const inputTokens = Math.max(toDashboardNumber(tokens.input_tokens), 0);
    const outputTokens = Math.max(toDashboardNumber(tokens.output_tokens), 0);
    const cachedTokens = Math.max(
      toDashboardNumber(tokens.cached_tokens ?? tokens.cache_tokens),
      0
    );
    const cacheReadTokens = Math.max(toDashboardNumber(tokens.cache_read_tokens), cachedTokens, 0);
    const splitCacheCreationTokens =
      Math.max(toDashboardNumber(tokens.cache_creation_tokens_5m), 0) +
      Math.max(toDashboardNumber(tokens.cache_creation_tokens_1h), 0);
    const cacheCreationTokens = Math.max(
      splitCacheCreationTokens ||
        toDashboardNumber(tokens.cache_write_tokens) ||
        toDashboardNumber(tokens.cache_creation_tokens),
      0
    );
    const reasoningTokens = Math.max(toDashboardNumber(tokens.reasoning_tokens), 0);
    const totalTokens = Math.max(
      toDashboardNumber(tokens.total_tokens) ||
        inputTokens +
          outputTokens +
          cachedTokens +
          cacheReadTokens +
          cacheCreationTokens +
          reasoningTokens,
      0
    );
    const method = monitoringText(detail.__endpointMethod);
    const path = monitoringText(detail.__endpointPath);
    const endpoint = monitoringText(detail.__endpoint) || [method, path].filter(Boolean).join(' ');
    const authIndex = getMonitoringAuthIndex(detail);
    const apiKeyHash = getMonitoringApiKeyHash(detail);
    const sourceHash = getMonitoringSourceHash(detail);
    return {
      event_hash: entry.eventHash,
      timestamp_ms: detail.__timestampMs,
      model: monitoringText(detail.__modelName) || getMonitoringModel(detail),
      endpoint,
      method,
      path,
      auth_index: authIndex,
      source: monitoringText(detail.source),
      source_hash: sourceHash,
      api_key_hash: apiKeyHash,
      client_ip: monitoringText(detail.client_ip),
      provider: monitoringText(detail.provider),
      account_snapshot: monitoringText(detail.account_snapshot),
      auth_label_snapshot: monitoringText(detail.auth_label_snapshot || detail.auth_file_snapshot),
      auth_provider_snapshot: monitoringText(detail.auth_provider_snapshot),
      auth_project_id_snapshot: monitoringText(detail.auth_project_id_snapshot),
      resolved_model: monitoringText(detail.__resolvedModel),
      reasoning_effort: monitoringText(detail.reasoning_effort),
      service_tier: monitoringText(detail.service_tier),
      executor_type: monitoringText(detail.executor_type),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
      cache_read_tokens: cacheReadTokens,
      cache_creation_tokens: cacheCreationTokens,
      cache_write_tokens: cacheCreationTokens,
      reasoning_tokens: reasoningTokens,
      total_tokens: totalTokens,
      latency_ms: toDashboardNumber(detail.latency_ms) || null,
      ttft_ms: toDashboardNumber(detail.ttft_ms) || null,
      failed: detail.failed === true,
      fail_status_code: detail.fail_status_code ?? null,
      fail_summary: monitoringText(detail.fail_summary || detail.fail_body),
    };
  });
  return {
    items,
    has_more: offset + pageItems.length < candidates.length,
    total_count: details.length,
  };
};

const buildFallbackMonitoringTaskBuckets = (
  details: UsageDetailWithEndpoint[]
): MonitoringAnalyticsTaskBucketRow[] => {
  const modelPrices = loadModelPrices();
  const buckets = new Map<
    string,
    {
      stats: DashboardMutableStats;
      firstMs: number;
      lastMs: number;
      source: string;
      sourceHash: string;
      authIndex: string;
      models: Set<string>;
      endpoints: Set<string>;
      maxLatencyMs: number | null;
    }
  >();
  details.forEach((detail) => {
    const sourceHash = getMonitoringSourceHash(detail);
    const authIndex = getMonitoringAuthIndex(detail);
    const day = new Date(detail.__timestampMs);
    day.setHours(0, 0, 0, 0);
    const key = `${day.getTime()}:${sourceHash}:${authIndex}`;
    const bucket = buckets.get(key) || {
      stats: createDashboardStats(),
      firstMs: detail.__timestampMs,
      lastMs: detail.__timestampMs,
      source: monitoringText(detail.source),
      sourceHash,
      authIndex,
      models: new Set<string>(),
      endpoints: new Set<string>(),
      maxLatencyMs: null,
    };
    addDetailToStats(bucket.stats, detail, calculateCost(detail, modelPrices));
    bucket.firstMs = Math.min(bucket.firstMs, detail.__timestampMs);
    bucket.lastMs = Math.max(bucket.lastMs, detail.__timestampMs);
    bucket.models.add(getMonitoringModel(detail));
    bucket.endpoints.add(monitoringText(detail.__endpoint));
    const latency = toDashboardNumber(detail.latency_ms);
    if (latency > 0) bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs ?? 0, latency);
    buckets.set(key, bucket);
  });
  return [...buckets.entries()]
    .sort(([, left], [, right]) => right.lastMs - left.lastMs)
    .slice(0, 100)
    .map(([bucketKey, bucket]) => ({
      bucket_key: bucketKey,
      total: bucket.stats.calls,
      success: bucket.stats.success,
      failure: bucket.stats.failure,
      first_ms: bucket.firstMs,
      last_ms: bucket.lastMs,
      source: bucket.source,
      source_hash: bucket.sourceHash,
      auth_index: bucket.authIndex,
      models: [...bucket.models].filter(Boolean),
      endpoints: [...bucket.endpoints].filter(Boolean),
      input_tokens: bucket.stats.inputTokens,
      output_tokens: bucket.stats.outputTokens,
      cached_tokens: bucket.stats.cachedTokens,
      cache_read_tokens: bucket.stats.cacheReadTokens,
      cache_creation_tokens: bucket.stats.cacheCreationTokens,
      total_tokens: bucket.stats.totalTokens,
      average_latency_ms: averageLatency(bucket.stats),
      max_latency_ms: bucket.maxLatencyMs,
    }));
};

export const buildFallbackMonitoringAnalytics = (
  payload: UsagePayload,
  request: MonitoringAnalyticsRequest
): MonitoringAnalyticsResponse => {
  const usage = unwrapUsagePayload(payload);
  const nowMs = request.now_ms ?? Date.now();
  const granularity = request.include?.granularity || 'day';
  const modelPrices = loadModelPrices();
  const allDetails = collectUsageDetailsWithEndpoint(usage).filter(
    (detail) => detail.__timestampMs > 0
  );
  const details = filterMonitoringDetails(allDetails, request, true);
  const stats = buildMonitoringStats(details);
  const rollingStartMs = nowMs - 30 * 60 * 1000;
  const rollingStats = buildMonitoringStats(
    details.filter(
      (detail) => detail.__timestampMs >= rollingStartMs && detail.__timestampMs <= nowMs
    )
  );
  const modelStats = new Map<string, DashboardModelStats>();
  const channelStats = new Map<string, MonitoringGroupStats>();
  const failureStats = new Map<string, MonitoringGroupStats>();
  const accountStats = new Map<string, MonitoringGroupStats>();
  const apiKeyStats = new Map<string, MonitoringGroupStats>();

  details.forEach((detail) => {
    const cost = calculateCost(detail, modelPrices);
    const model = getMonitoringModel(detail);
    const currentModel =
      modelStats.get(model) || ({ ...createDashboardStats(), model } satisfies DashboardModelStats);
    addDetailToStats(currentModel, detail, cost);
    modelStats.set(model, currentModel);

    const authIndex = getMonitoringAuthIndex(detail);
    const channel = channelStats.get(authIndex) || createMonitoringGroupStats(authIndex);
    addDetailToMonitoringGroupStats(channel, detail, cost);
    channelStats.set(authIndex, channel);

    const sourceHash = getMonitoringSourceHash(detail);
    const failureKey = `${sourceHash}:${authIndex}`;
    const failure = failureStats.get(failureKey) || createMonitoringGroupStats(failureKey);
    addDetailToMonitoringGroupStats(failure, detail, cost);
    failureStats.set(failureKey, failure);

    const accountId = getMonitoringAccountId(detail);
    const account = accountStats.get(accountId) || createMonitoringGroupStats(accountId);
    addDetailToMonitoringGroupStats(account, detail, cost);
    accountStats.set(accountId, account);

    const apiKeyHash = getMonitoringApiKeyHash(detail);
    const apiKey = apiKeyStats.get(apiKeyHash) || createMonitoringGroupStats(apiKeyHash);
    addDetailToMonitoringGroupStats(apiKey, detail, cost);
    apiKeyStats.set(apiKeyHash, apiKey);
  });

  const modelStatRows: MonitoringAnalyticsModelStat[] = [...modelStats.values()]
    .sort((left, right) => right.totalTokens - left.totalTokens || right.calls - left.calls)
    .map((model) => ({
      model: model.model,
      calls: model.calls,
      success_calls: model.success,
      failure_calls: model.failure,
      success_rate: successRate(model),
      input_tokens: model.inputTokens,
      output_tokens: model.outputTokens,
      cached_tokens: model.cachedTokens,
      cache_read_tokens: model.cacheReadTokens,
      cache_creation_tokens: model.cacheCreationTokens,
      total_tokens: model.totalTokens,
      cost: model.totalCost,
    }));

  const channelRows: MonitoringAnalyticsChannelShareRow[] = [...channelStats.values()]
    .sort((left, right) => right.calls - left.calls)
    .map((channel) => ({
      auth_index: channel.id,
      provider: channel.provider,
      source: [...channel.sources].find(Boolean) || '',
      account_snapshot: channel.accountSnapshot,
      auth_label_snapshot: channel.authLabelSnapshot,
      calls: channel.calls,
      success: channel.success,
      failure: channel.failure,
      tokens: channel.totalTokens,
      cost: channel.totalCost,
      average_latency_ms: averageLatency(channel),
    }));

  const toAccountRow = (group: MonitoringGroupStats): MonitoringAnalyticsAccountStatRow => ({
    id: group.id,
    account_snapshot: group.accountSnapshot || group.id,
    auth_label_snapshot: group.authLabelSnapshot,
    auth_provider_snapshot: group.authProviderSnapshot,
    auth_indices: [...group.authIndices].filter(Boolean),
    sources: [...group.sources].filter(Boolean),
    source_hashes: [...group.sourceHashes].filter(Boolean),
    calls: group.calls,
    success_calls: group.success,
    failure_calls: group.failure,
    success_rate: successRate(group),
    input_tokens: group.inputTokens,
    output_tokens: group.outputTokens,
    cached_tokens: group.cachedTokens,
    cache_read_tokens: group.cacheReadTokens,
    cache_creation_tokens: group.cacheCreationTokens,
    total_tokens: group.totalTokens,
    cost: group.totalCost,
    average_latency_ms: averageLatency(group),
    last_seen_ms: group.lastSeenMs,
    models: toMonitoringModelSpendRows(group.models),
  });

  const toApiKeyRow = (group: MonitoringGroupStats): MonitoringAnalyticsApiKeyStatRow => ({
    ...toAccountRow(group),
    api_key_hash: group.id,
  });

  const recentFailureLimit =
    typeof request.include?.recent_failures === 'number' ? request.include.recent_failures : 8;
  const recentFailures: MonitoringAnalyticsRecentFailure[] = details
    .filter((detail) => detail.failed)
    .sort((left, right) => right.__timestampMs - left.__timestampMs)
    .slice(0, recentFailureLimit)
    .map((detail) => ({
      timestamp_ms: detail.__timestampMs,
      model: getMonitoringModel(detail),
      api_key_hash: getMonitoringApiKeyHash(detail),
      source: monitoringText(detail.source),
      source_hash: getMonitoringSourceHash(detail),
      auth_index: getMonitoringAuthIndex(detail),
      account_snapshot: monitoringText(detail.account_snapshot),
      auth_label_snapshot: monitoringText(detail.auth_label_snapshot || detail.auth_file_snapshot),
      auth_provider_snapshot: monitoringText(detail.auth_provider_snapshot),
      auth_project_id_snapshot: monitoringText(detail.auth_project_id_snapshot),
      endpoint: monitoringText(detail.__endpoint),
      duration_ms: toDashboardNumber(detail.latency_ms) || null,
      fail_status_code: detail.fail_status_code ?? null,
      fail_summary: monitoringText(detail.fail_summary || detail.fail_body),
    }));

  const days = Math.max((request.to_ms - request.from_ms) / (24 * 60 * 60 * 1000), 1);
  const response: MonitoringAnalyticsResponse = {
    generated_at_ms: nowMs,
    granularity,
  };
  if (request.include?.summary === true) {
    response.summary = {
      total_calls: stats.calls,
      success_calls: stats.success,
      failure_calls: stats.failure,
      success_rate: successRate(stats),
      input_tokens: stats.inputTokens,
      output_tokens: stats.outputTokens,
      cached_tokens: stats.cachedTokens,
      cache_read_tokens: stats.cacheReadTokens,
      cache_creation_tokens: stats.cacheCreationTokens,
      reasoning_tokens: stats.reasoningTokens,
      total_tokens: stats.totalTokens,
      total_cost: stats.totalCost,
      average_latency_ms: averageLatency(stats),
      zero_token_calls: stats.zeroTokenCalls,
      rpm_30m: rollingStats.calls / 30,
      tpm_30m: rollingStats.totalTokens / 30,
      avg_daily_requests: stats.calls / days,
      avg_daily_tokens: stats.totalTokens / days,
      approx_tasks: stats.calls,
      approx_task_failures: stats.failure,
      approx_task_success_rate: successRate(stats),
      zero_token_models: modelStatRows
        .filter((row) => row.total_tokens <= 0)
        .map((row) => row.model),
    };
  }
  if (request.include?.timeline === true) {
    response.timeline = buildFallbackMonitoringTimeline(details, granularity);
  }
  if (request.include?.hourly_distribution === true) {
    response.hourly_distribution = buildFallbackMonitoringHourlyDistribution(details);
  }
  if (request.include?.model_share === true) {
    response.model_share = modelStatRows.map((row) => ({
      model: row.model,
      calls: row.calls,
      tokens: row.total_tokens,
      cost: row.cost,
    }));
  }
  if (request.include?.model_stats === true) response.model_stats = modelStatRows;
  if (request.include?.channel_share === true) response.channel_share = channelRows;
  if (request.include?.failure_sources === true) {
    response.failure_sources = [...failureStats.values()]
      .filter((row) => row.failure > 0)
      .sort((left, right) => right.failure - left.failure || right.calls - left.calls)
      .map((row) => ({
        source: [...row.sources].find(Boolean) || '',
        source_hash: [...row.sourceHashes].find(Boolean) || row.id,
        auth_index: [...row.authIndices][0] || '-',
        account_snapshot: row.accountSnapshot,
        auth_label_snapshot: row.authLabelSnapshot,
        auth_provider_snapshot: row.authProviderSnapshot,
        calls: row.calls,
        failure: row.failure,
        last_seen_ms: row.lastSeenMs,
        average_latency_ms: averageLatency(row),
      }));
  }
  if (request.include?.account_stats === true) {
    response.account_stats = [...accountStats.values()]
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs || right.calls - left.calls)
      .map(toAccountRow);
  }
  if (request.include?.api_key_stats === true) {
    response.api_key_stats = [...apiKeyStats.values()]
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs || right.calls - left.calls)
      .map(toApiKeyRow);
  }
  if (request.include?.filter_options === true) {
    const optionRequest = { ...request, filters: undefined };
    const optionAnalytics = buildFallbackMonitoringAnalytics(
      { ...usage, apis: usage.apis },
      {
        ...optionRequest,
        include: {
          account_stats: true,
          api_key_stats: true,
          channel_share: true,
          model_stats: true,
          summary: false,
          timeline: false,
          hourly_distribution: false,
          model_share: false,
          failure_sources: false,
          task_buckets: false,
          recent_failures: 0,
        },
      }
    );
    response.filter_options = {
      account_stats: optionAnalytics.account_stats,
      api_key_stats: optionAnalytics.api_key_stats,
      channel_share: optionAnalytics.channel_share,
      model_stats: optionAnalytics.model_stats,
    };
  }
  if (request.include?.task_buckets === true) {
    response.task_buckets = buildFallbackMonitoringTaskBuckets(details);
  }
  if (request.include?.recent_failures !== undefined) response.recent_failures = recentFailures;
  if (request.include?.events_page) {
    response.events = buildFallbackMonitoringEvents(details, request);
  }
  return response;
};

export const dashboardApi = {
  getSummary: async (
    base: string,
    managementKey: string | undefined,
    params: DashboardSummaryParams
  ): Promise<DashboardSummaryResponse> => {
    return withUsageServiceError(async () => {
      const query: Record<string, number> = {
        today_start_ms: params.todayStartMs,
      };
      if (params.nowMs !== undefined) query.now_ms = params.nowMs;
      if (params.topModels !== undefined) query.top_models = params.topModels;
      if (params.recentFailures !== undefined) query.recent_failures = params.recentFailures;

      try {
        const response = await axios.get<DashboardSummaryResponse>(
          buildUrl(base, '/v0/management/dashboard/summary'),
          {
            timeout: USAGE_SERVICE_TIMEOUT_MS,
            headers: authHeaders(managementKey),
            params: query,
          }
        );
        return response.data;
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) {
          throw error;
        }
        const usageResponse = await axios.get<UsagePayload>(
          buildUrl(base, '/v0/management/usage'),
          {
            timeout: USAGE_SERVICE_TIMEOUT_MS,
            headers: authHeaders(managementKey),
          }
        );
        const payload = isRecord(usageResponse.data?.usage)
          ? (usageResponse.data.usage as UsagePayload)
          : usageResponse.data;
        return buildFallbackDashboardSummary(payload, params);
      }
    });
  },
};

export const monitoringAnalyticsApi = {
  getHeaderSnapshots: async (
    base: string,
    managementKey: string | undefined,
    params: { days?: number; limit?: number } = {}
  ): Promise<UsageHeaderSnapshotsResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.get<UsageHeaderSnapshotsResponse>(
        buildUrl(base, '/v0/management/monitoring/header-snapshots'),
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
          params,
        }
      );
      return response.data;
    });
  },
  getAnalytics: async (
    base: string,
    managementKey: string | undefined,
    request: MonitoringAnalyticsRequest
  ): Promise<MonitoringAnalyticsResponse> => {
    return withUsageServiceError(async () => {
      const response = await axios.post<MonitoringAnalyticsResponse>(
        buildUrl(base, '/v0/management/monitoring/analytics'),
        request,
        {
          timeout: USAGE_SERVICE_TIMEOUT_MS,
          headers: authHeaders(managementKey),
        }
      );
      return response.data;
    });
  },
};

export type MonitoringDataTab = 'accounts' | 'apiKeys' | 'realtime';
export type MonitoringCenterTimeRange = 'today' | '7d' | '14d' | '30d' | 'all' | 'custom';
export type MonitoringCenterStatusFilter = 'all' | 'success' | 'failed';
export type RealtimeColumnKey =
  | 'source'
  | 'model'
  | 'endpoint'
  | 'clientIp'
  | 'authIndex'
  | 'provider'
  | 'reasoning'
  | 'recent'
  | 'status'
  | 'successRate'
  | 'totalCalls'
  | 'tps'
  | 'latency'
  | 'time'
  | 'usage'
  | 'cost'
  | 'apiKeyHash';

export type RealtimeColumnWidths = Partial<Record<RealtimeColumnKey, number>>;

export const MONITORING_DATA_TABS: readonly MonitoringDataTab[] = [
  'accounts',
  'apiKeys',
  'realtime',
] as const;

export const REALTIME_COLUMN_KEYS: readonly RealtimeColumnKey[] = [
  'source',
  'model',
  'endpoint',
  'clientIp',
  'authIndex',
  'provider',
  'reasoning',
  'recent',
  'status',
  'successRate',
  'totalCalls',
  'tps',
  'latency',
  'time',
  'usage',
  'cost',
  'apiKeyHash',
] as const;

export const DEFAULT_REALTIME_COLUMNS: readonly RealtimeColumnKey[] = [
  'source',
  'model',
  'endpoint',
  'clientIp',
  'reasoning',
  'recent',
  'status',
  'successRate',
  'totalCalls',
  'tps',
  'latency',
  'time',
  'usage',
  'cost',
] as const;

const LEGACY_DEFAULT_REALTIME_COLUMNS: readonly RealtimeColumnKey[] = [
  'source',
  'model',
  'endpoint',
  'authIndex',
  'reasoning',
  'recent',
  'status',
  'successRate',
  'totalCalls',
  'tps',
  'latency',
  'time',
  'usage',
  'cost',
] as const;

const PREVIOUS_DEFAULT_REALTIME_COLUMNS: readonly RealtimeColumnKey[] = [
  'source',
  'model',
  'endpoint',
  'reasoning',
  'recent',
  'status',
  'successRate',
  'totalCalls',
  'tps',
  'latency',
  'time',
  'usage',
  'cost',
] as const;

export const DEFAULT_MONITORING_DATA_TAB: MonitoringDataTab = 'accounts';
export const DEFAULT_MONITORING_TIME_RANGE: MonitoringCenterTimeRange = 'today';
export const DEFAULT_MONITORING_AUTO_REFRESH_MS = '5000';
export const DEFAULT_MONITORING_TABLE_PAGE_SIZE = 12;
export const DEFAULT_MONITORING_REALTIME_PAGE_SIZE = 10;

export const MONITORING_CENTER_UI_STATE_STORAGE_KEY = 'monitoring.centerUiState';

export type MonitoringCenterUiState = {
  activeDataTab: MonitoringDataTab;
  timeRange: MonitoringCenterTimeRange;
  customStartInput: string;
  customEndInput: string;
  searchInput: string;
  autoRefreshMs: string;
  selectedAccount: string;
  selectedProvider: string;
  selectedModel: string;
  selectedChannel: string;
  selectedApiKeyHash: string;
  selectedStatus: MonitoringCenterStatusFilter;
  apiKeyPageSize: number;
  realtimePageSize: number;
  realtimeColumns: RealtimeColumnKey[];
  realtimeColumnWidths: RealtimeColumnWidths;
};

const TAB_SET = new Set<MonitoringDataTab>(MONITORING_DATA_TABS);
const TIME_RANGE_SET = new Set<MonitoringCenterTimeRange>([
  'today',
  '7d',
  '14d',
  '30d',
  'all',
  'custom',
]);
const STATUS_FILTER_SET = new Set<MonitoringCenterStatusFilter>(['all', 'success', 'failed']);
const AUTO_REFRESH_MS_SET = new Set(['0', '5000', '10000', '30000', '60000', '300000']);
const TABLE_PAGE_SIZE_OPTIONS = [12, 20, 50, 100] as const;
const REALTIME_PAGE_SIZE_OPTIONS = [10, 50, 100, 150, 300] as const;
const REALTIME_COLUMN_SET = new Set<RealtimeColumnKey>(REALTIME_COLUMN_KEYS);
export const MIN_REALTIME_COLUMN_WIDTH = 72;
export const MAX_REALTIME_COLUMN_WIDTH = 520;

export const normalizeMonitoringDataTab = (value: unknown): MonitoringDataTab =>
  typeof value === 'string' && TAB_SET.has(value as MonitoringDataTab)
    ? (value as MonitoringDataTab)
    : DEFAULT_MONITORING_DATA_TAB;

export const normalizeMonitoringTimeRange = (value: unknown): MonitoringCenterTimeRange =>
  typeof value === 'string' && TIME_RANGE_SET.has(value as MonitoringCenterTimeRange)
    ? (value as MonitoringCenterTimeRange)
    : DEFAULT_MONITORING_TIME_RANGE;

export const normalizeMonitoringStatusFilter = (value: unknown): MonitoringCenterStatusFilter =>
  typeof value === 'string' && STATUS_FILTER_SET.has(value as MonitoringCenterStatusFilter)
    ? (value as MonitoringCenterStatusFilter)
    : 'all';

export const normalizeMonitoringAutoRefreshMs = (value: unknown): string => {
  const stringValue = typeof value === 'number' ? String(value) : value;
  return typeof stringValue === 'string' && AUTO_REFRESH_MS_SET.has(stringValue)
    ? stringValue
    : DEFAULT_MONITORING_AUTO_REFRESH_MS;
};

const normalizeString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const normalizeSelectValue = (value: unknown): string => {
  const normalized = normalizeString(value, 'all').trim();
  return normalized || 'all';
};

const normalizePageSize = (
  value: unknown,
  options: readonly number[],
  fallback: number
): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && options.includes(parsed) ? parsed : fallback;
};

export const normalizeRealtimeColumns = (value: unknown): RealtimeColumnKey[] => {
  if (!Array.isArray(value)) return [...DEFAULT_REALTIME_COLUMNS];
  const normalized = value.filter(
    (item): item is RealtimeColumnKey =>
      typeof item === 'string' && REALTIME_COLUMN_SET.has(item as RealtimeColumnKey)
  );
  const unique = Array.from(new Set(normalized));
  const isKnownDefault = [LEGACY_DEFAULT_REALTIME_COLUMNS, PREVIOUS_DEFAULT_REALTIME_COLUMNS].some(
    (columns) =>
      unique.length === columns.length && unique.every((item, index) => item === columns[index])
  );
  if (isKnownDefault) {
    return [...DEFAULT_REALTIME_COLUMNS];
  }
  return unique.length > 0 ? unique : [...DEFAULT_REALTIME_COLUMNS];
};

export const normalizeRealtimeColumnWidths = (value: unknown): RealtimeColumnWidths => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return REALTIME_COLUMN_KEYS.reduce<RealtimeColumnWidths>((result, key) => {
    const raw = record[key];
    const parsed = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return result;
    const rounded = Math.round(parsed);
    if (rounded < MIN_REALTIME_COLUMN_WIDTH || rounded > MAX_REALTIME_COLUMN_WIDTH) return result;
    result[key] = rounded;
    return result;
  }, {});
};

export const getDefaultMonitoringCenterUiState = (): MonitoringCenterUiState => ({
  activeDataTab: DEFAULT_MONITORING_DATA_TAB,
  timeRange: DEFAULT_MONITORING_TIME_RANGE,
  customStartInput: '',
  customEndInput: '',
  searchInput: '',
  autoRefreshMs: DEFAULT_MONITORING_AUTO_REFRESH_MS,
  selectedAccount: 'all',
  selectedProvider: 'all',
  selectedModel: 'all',
  selectedChannel: 'all',
  selectedApiKeyHash: 'all',
  selectedStatus: 'all',
  apiKeyPageSize: DEFAULT_MONITORING_TABLE_PAGE_SIZE,
  realtimePageSize: DEFAULT_MONITORING_REALTIME_PAGE_SIZE,
  realtimeColumns: [...DEFAULT_REALTIME_COLUMNS],
  realtimeColumnWidths: {},
});

export const normalizeMonitoringCenterUiState = (value: unknown): MonitoringCenterUiState => {
  const defaults = getDefaultMonitoringCenterUiState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  return {
    activeDataTab: normalizeMonitoringDataTab(record.activeDataTab),
    timeRange: normalizeMonitoringTimeRange(record.timeRange),
    customStartInput: normalizeString(record.customStartInput),
    customEndInput: normalizeString(record.customEndInput),
    searchInput: normalizeString(record.searchInput),
    autoRefreshMs: normalizeMonitoringAutoRefreshMs(record.autoRefreshMs),
    selectedAccount: normalizeSelectValue(record.selectedAccount),
    selectedProvider: normalizeSelectValue(record.selectedProvider),
    selectedModel: normalizeSelectValue(record.selectedModel),
    selectedChannel: normalizeSelectValue(record.selectedChannel),
    selectedApiKeyHash: normalizeSelectValue(record.selectedApiKeyHash),
    selectedStatus: normalizeMonitoringStatusFilter(record.selectedStatus),
    apiKeyPageSize: normalizePageSize(
      record.apiKeyPageSize,
      TABLE_PAGE_SIZE_OPTIONS,
      defaults.apiKeyPageSize
    ),
    realtimePageSize: normalizePageSize(
      record.realtimePageSize,
      REALTIME_PAGE_SIZE_OPTIONS,
      defaults.realtimePageSize
    ),
    realtimeColumns: normalizeRealtimeColumns(record.realtimeColumns),
    realtimeColumnWidths: normalizeRealtimeColumnWidths(record.realtimeColumnWidths),
  };
};

export const readMonitoringCenterUiState = (): MonitoringCenterUiState => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return getDefaultMonitoringCenterUiState();
  }

  try {
    const raw = window.localStorage.getItem(MONITORING_CENTER_UI_STATE_STORAGE_KEY);
    if (raw) {
      return normalizeMonitoringCenterUiState(JSON.parse(raw));
    }
  } catch {
    // Ignore storage failures and fall back to defaults.
  }

  return getDefaultMonitoringCenterUiState();
};

export const writeMonitoringCenterUiState = (state: Partial<MonitoringCenterUiState>) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      MONITORING_CENTER_UI_STATE_STORAGE_KEY,
      JSON.stringify(normalizeMonitoringCenterUiState(state))
    );
  } catch {
    // Ignore storage failures and keep the runtime state in memory only.
  }
};

// Clear absolute monitoring dates when their backing request history is deleted.
export const clearMonitoringCustomTimeRange = () => {
  const state = readMonitoringCenterUiState();
  writeMonitoringCenterUiState({
    ...state,
    timeRange: DEFAULT_MONITORING_TIME_RANGE,
    customStartInput: '',
    customEndInput: '',
  });
};

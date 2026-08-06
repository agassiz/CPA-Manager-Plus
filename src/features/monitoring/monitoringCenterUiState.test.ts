import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MONITORING_DATA_TAB,
  DEFAULT_REALTIME_COLUMNS,
  MONITORING_CENTER_UI_STATE_STORAGE_KEY,
  REALTIME_COLUMN_KEYS,
  getDefaultMonitoringCenterUiState,
  normalizeMonitoringCenterUiState,
  normalizeMonitoringAutoRefreshMs,
  normalizeMonitoringDataTab,
  normalizeRealtimeColumnWidths,
  normalizeRealtimeColumns,
  normalizeMonitoringStatusFilter,
  normalizeMonitoringTimeRange,
  readMonitoringCenterUiState,
  writeMonitoringCenterUiState,
} from './monitoringCenterUiState';

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const originalWindow = (globalThis as { window?: unknown }).window;

describe('monitoringCenterUiState', () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('falls back to default tab for unknown values', () => {
    expect(normalizeMonitoringDataTab('weird')).toBe(DEFAULT_MONITORING_DATA_TAB);
    expect(normalizeMonitoringDataTab(undefined)).toBe(DEFAULT_MONITORING_DATA_TAB);
    expect(normalizeMonitoringDataTab(42)).toBe(DEFAULT_MONITORING_DATA_TAB);
  });

  it('keeps known tab ids during normalization', () => {
    expect(normalizeMonitoringDataTab('accounts')).toBe('accounts');
    expect(normalizeMonitoringDataTab('apiKeys')).toBe('apiKeys');
    expect(normalizeMonitoringDataTab('realtime')).toBe('realtime');
  });

  it('normalizes persisted filter fields', () => {
    expect(normalizeMonitoringTimeRange('30d')).toBe('30d');
    expect(normalizeMonitoringTimeRange('bad')).toBe('today');
    expect(normalizeMonitoringStatusFilter('failed')).toBe('failed');
    expect(normalizeMonitoringStatusFilter('bad')).toBe('all');
    expect(normalizeMonitoringAutoRefreshMs(30000)).toBe('30000');
    expect(normalizeMonitoringAutoRefreshMs('123')).toBe('5000');
    expect(normalizeRealtimeColumns(['model', 'endpoint', 'model', 'error', 'bad'])).toEqual([
      'model',
      'endpoint',
    ]);
    expect(normalizeRealtimeColumns([])).toEqual([...DEFAULT_REALTIME_COLUMNS]);
    expect(
      normalizeRealtimeColumnWidths({
        model: 180,
        endpoint: '260',
        source: 40,
        cost: 9999,
        nope: 200,
      })
    ).toEqual({
      model: 180,
      endpoint: 260,
    });
  });

  it('keeps source and endpoint in default realtime columns without auth index', () => {
    expect(DEFAULT_REALTIME_COLUMNS).toContain('source');
    expect(DEFAULT_REALTIME_COLUMNS).toContain('endpoint');
    expect(DEFAULT_REALTIME_COLUMNS).toContain('clientIp');
    expect(DEFAULT_REALTIME_COLUMNS).not.toContain('authIndex');
    expect(REALTIME_COLUMN_KEYS).toEqual(
      expect.arrayContaining(['source', 'endpoint', 'authIndex'])
    );
  });

  it('migrates the legacy realtime default columns to the current default', () => {
    expect(
      normalizeRealtimeColumns([
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
      ])
    ).toEqual([...DEFAULT_REALTIME_COLUMNS]);
  });

  it('migrates the previous realtime default columns to include client IP', () => {
    expect(
      normalizeRealtimeColumns([
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
      ])
    ).toEqual([...DEFAULT_REALTIME_COLUMNS]);
  });

  it('normalizes ui state from arbitrary input', () => {
    expect(normalizeMonitoringCenterUiState(null)).toEqual(getDefaultMonitoringCenterUiState());
    expect(normalizeMonitoringCenterUiState({ activeDataTab: 'realtime' })).toEqual({
      ...getDefaultMonitoringCenterUiState(),
      activeDataTab: 'realtime',
    });
    expect(
      normalizeMonitoringCenterUiState({
        activeDataTab: 'nope',
        timeRange: 'custom',
        customStartInput: '2026-05-01T00:00',
        customEndInput: '2026-05-02T00:00',
        searchInput: 'gpt',
        autoRefreshMs: '60000',
        selectedAccount: 'account@example.com',
        selectedProvider: 'codex',
        selectedModel: 'gpt-5',
        selectedChannel: 'default',
        selectedApiKeyHash: 'hash',
        selectedStatus: 'failed',
        apiKeyPageSize: 50,
        realtimePageSize: 150,
        realtimeColumns: ['source', 'model', 'endpoint'],
        realtimeColumnWidths: {
          source: 280,
          model: 180,
          bad: 200,
        },
      })
    ).toEqual({
      ...getDefaultMonitoringCenterUiState(),
      activeDataTab: DEFAULT_MONITORING_DATA_TAB,
      timeRange: 'custom',
      customStartInput: '2026-05-01T00:00',
      customEndInput: '2026-05-02T00:00',
      searchInput: 'gpt',
      autoRefreshMs: '60000',
      selectedAccount: 'account@example.com',
      selectedProvider: 'codex',
      selectedModel: 'gpt-5',
      selectedChannel: 'default',
      selectedApiKeyHash: 'hash',
      selectedStatus: 'failed',
      apiKeyPageSize: 50,
      realtimePageSize: 150,
      realtimeColumns: ['source', 'model', 'endpoint'],
      realtimeColumnWidths: {
        source: 280,
        model: 180,
      },
    });
  });

  it('persists and reads ui state via localStorage', () => {
    writeMonitoringCenterUiState({
      activeDataTab: 'apiKeys',
      selectedProvider: 'claude',
      apiKeyPageSize: 20,
      realtimeColumnWidths: {
        usage: 240,
      },
    });
    expect(JSON.parse(storage.getItem(MONITORING_CENTER_UI_STATE_STORAGE_KEY) ?? '{}')).toEqual({
      ...getDefaultMonitoringCenterUiState(),
      activeDataTab: 'apiKeys',
      selectedProvider: 'claude',
      apiKeyPageSize: 20,
      realtimeColumnWidths: {
        usage: 240,
      },
    });
    expect(readMonitoringCenterUiState()).toEqual({
      ...getDefaultMonitoringCenterUiState(),
      activeDataTab: 'apiKeys',
      selectedProvider: 'claude',
      apiKeyPageSize: 20,
      realtimeColumnWidths: {
        usage: 240,
      },
    });
  });

  it('returns defaults when stored payload is invalid JSON', () => {
    storage.setItem(MONITORING_CENTER_UI_STATE_STORAGE_KEY, '{not json');
    expect(readMonitoringCenterUiState()).toEqual(getDefaultMonitoringCenterUiState());
  });
});

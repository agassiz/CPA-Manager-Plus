import { act, create } from 'react-test-renderer';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usageServiceApi } from '@/services/api/usageService';
import { useAuthStore } from '@/stores';
import { useUsageData, type UseUsageDataReturn } from './useUsageData';

vi.mock('@/hooks/usePanelFeatureAvailability', () => ({
  usePanelFeatureAvailability: () => ({
    checking: false,
    panelBase: 'http://127.0.0.1:5173',
    serviceBase: 'http://127.0.0.1:8317',
    serviceAvailable: true,
    requestMonitoringAvailable: true,
    modelPricesAvailable: true,
    reason: '',
  }),
}));

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

describe('useUsageData', () => {
  beforeEach(() => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', {
      location: {
        host: '127.0.0.1:5173',
      },
      localStorage,
    });
    vi.stubGlobal('navigator', { userAgent: 'vitest' });
    useAuthStore.setState({
      apiBase: 'http://127.0.0.1:8317',
      managementKey: 'management-key',
    });
    vi.spyOn(usageServiceApi, 'getModelPrices').mockResolvedValue({ prices: {} });
    vi.spyOn(usageServiceApi, 'getApiKeyAliases').mockResolvedValue({ items: [] });
    vi.spyOn(usageServiceApi, 'getUsage').mockResolvedValue({
      total_requests: 0,
      success_count: 0,
      failure_count: 0,
      total_tokens: 0,
      apis: {},
    });
    vi.spyOn(usageServiceApi, 'clearUsage').mockResolvedValue({
      success: true,
      removed: true,
    });
    vi.spyOn(usageServiceApi, 'clearFailures').mockResolvedValue({
      success: true,
      removed: true,
      logs_removed: 1,
    });
    vi.spyOn(usageServiceApi, 'syncModelPrices').mockResolvedValue({
      prices: {
        'gpt-4o': { prompt: 1, completion: 2, cache: 0.5, source: 'sync' },
      },
      imported: 1,
      skipped: 0,
      source: 'sync',
      candidates: [],
      unmatched: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the native CPA backend for model price sync when model pricing is available', async () => {
    let current: UseUsageDataReturn | null = null;

    function Harness({ onReady }: { onReady: (value: UseUsageDataReturn) => void }) {
      const value = useUsageData();
      useEffect(() => {
        onReady(value);
      }, [onReady, value]);
      return null;
    }

    await act(async () => {
      create(<Harness onReady={(value) => { current = value; }} />);
    });

    await act(async () => {
      await current?.syncModelPrices(['gpt-4o']);
    });

    expect(usageServiceApi.syncModelPrices).toHaveBeenCalledWith(
      'http://127.0.0.1:8317',
      'management-key',
      ['gpt-4o']
    );
  });

  it('clears usage statistics through the request monitoring service base', async () => {
    let current: UseUsageDataReturn | null = null;

    function Harness({ onReady }: { onReady: (value: UseUsageDataReturn) => void }) {
      const value = useUsageData();
      useEffect(() => {
        onReady(value);
      }, [onReady, value]);
      return null;
    }

    await act(async () => {
      create(<Harness onReady={(value) => { current = value; }} />);
    });

    await act(async () => {
      await current?.clearUsage();
    });

    expect(usageServiceApi.clearUsage).toHaveBeenCalledWith(
      'http://127.0.0.1:8317',
      'management-key'
    );
  });

  it('clears failure statistics through the request monitoring service base', async () => {
    let current: UseUsageDataReturn | null = null;

    function Harness({ onReady }: { onReady: (value: UseUsageDataReturn) => void }) {
      const value = useUsageData();
      useEffect(() => {
        onReady(value);
      }, [onReady, value]);
      return null;
    }

    await act(async () => {
      create(<Harness onReady={(value) => { current = value; }} />);
    });

    await act(async () => {
      await current?.clearFailures();
    });

    expect(usageServiceApi.clearFailures).toHaveBeenCalledWith(
      'http://127.0.0.1:8317',
      'management-key'
    );
  });
});

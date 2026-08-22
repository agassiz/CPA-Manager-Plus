import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { usageServiceApi } from '@/services/api/usageService';
import { useAuthStore } from '@/stores';
import {
  buildNativeRequestMonitoringAvailability,
  buildUnavailableAvailability,
  detectPanelFeatureAvailability,
  usePanelFeatureAvailability,
} from './usePanelFeatureAvailability';

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

describe('panel feature availability', () => {
  it('enables native usage and local model pricing from the current management API', () => {
    const availability = buildNativeRequestMonitoringAvailability({
      apiBase: 'http://cpa.local:8317',
      panelBase: 'http://panel.local:5173',
    });

    expect(availability.serviceBase).toBe('http://cpa.local:8317');
    expect(availability.serviceAvailable).toBe(true);
    expect(availability.requestMonitoringAvailable).toBe(true);
    expect(availability.modelPricesAvailable).toBe(true);
    expect(availability.reason).toBe('');
  });

  it('marks features unavailable when the management key is missing', () => {
    const availability = buildUnavailableAvailability({
      apiBase: 'http://cpa.local:8317',
      panelBase: 'http://panel.local:5173',
      reason: 'service_not_configured',
    });

    expect(availability.serviceBase).toBe('http://cpa.local:8317');
    expect(availability.serviceAvailable).toBe(false);
    expect(availability.requestMonitoringAvailable).toBe(false);
    expect(availability.modelPricesAvailable).toBe(false);
    expect(availability.reason).toBe('service_not_configured');
  });

  it('shares one feature detection request across concurrent hook consumers', async () => {
    const getUsageSpy = vi.spyOn(usageServiceApi, 'getUsage').mockResolvedValue({
      total_requests: 0,
      success_count: 0,
      failure_count: 0,
      total_tokens: 0,
      apis: {},
    });
    let renderer: ReactTestRenderer | null = null;
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        hostname: 'panel.local',
        host: 'panel.local:5174',
        port: '5174',
      },
    });
    vi.stubGlobal('navigator', { userAgent: 'vitest' });
    vi.stubGlobal('localStorage', createMemoryStorage());

    try {
      useAuthStore.setState({
        apiBase: 'http://cpa.local:8317',
        managementKey: 'management-key',
      });

      function HookConsumer() {
        usePanelFeatureAvailability();
        return null;
      }

      await act(async () => {
        renderer = create(
          createElement('div', null, createElement(HookConsumer), createElement(HookConsumer))
        );
      });

      expect(getUsageSpy).toHaveBeenCalledTimes(1);
      expect(getUsageSpy).toHaveBeenNthCalledWith(1, 'http://cpa.local:8317', 'management-key');
    } finally {
      act(() => {
        renderer?.unmount();
      });
      getUsageSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('keeps monitoring entries visible and skips caching after a transient probe failure', async () => {
    const transientError = Object.assign(new Error('timeout of 15000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    const getUsageSpy = vi
      .spyOn(usageServiceApi, 'getUsage')
      .mockRejectedValue(transientError);

    try {
      const result = await detectPanelFeatureAvailability(
        {
          apiBase: 'http://cpa.local:8317',
          managementKey: 'management-key',
          panelBase: 'http://panel.local:5173',
        },
        [0, 0]
      );

      expect(getUsageSpy).toHaveBeenCalledTimes(3);
      expect(result.cacheable).toBe(false);
      expect(result.availability.requestMonitoringAvailable).toBe(true);
      expect(result.availability.modelPricesAvailable).toBe(true);
    } finally {
      getUsageSpy.mockRestore();
    }
  });

  it('does not retry an unauthorized probe and leaves the result uncached', async () => {
    const unauthorizedError = Object.assign(new Error('invalid management key'), { status: 401 });
    const getUsageSpy = vi
      .spyOn(usageServiceApi, 'getUsage')
      .mockRejectedValue(unauthorizedError);

    try {
      const result = await detectPanelFeatureAvailability(
        {
          apiBase: 'http://cpa.local:8317',
          managementKey: 'management-key',
          panelBase: 'http://panel.local:5173',
        },
        [0, 0]
      );

      expect(getUsageSpy).toHaveBeenCalledTimes(1);
      expect(result.cacheable).toBe(false);
      expect(result.availability.requestMonitoringAvailable).toBe(true);
    } finally {
      getUsageSpy.mockRestore();
    }
  });

  it('marks features unavailable and caches the result when the endpoint is missing', async () => {
    const missingEndpointError = Object.assign(new Error('not found'), { status: 404 });
    const getUsageSpy = vi
      .spyOn(usageServiceApi, 'getUsage')
      .mockRejectedValue(missingEndpointError);

    try {
      const result = await detectPanelFeatureAvailability(
        {
          apiBase: 'http://cpa.local:8317',
          managementKey: 'management-key',
          panelBase: 'http://panel.local:5173',
        },
        [0, 0]
      );

      expect(getUsageSpy).toHaveBeenCalledTimes(1);
      expect(result.cacheable).toBe(true);
      expect(result.availability.requestMonitoringAvailable).toBe(false);
      expect(result.availability.reason).toBe('service_unavailable');
    } finally {
      getUsageSpy.mockRestore();
    }
  });
});

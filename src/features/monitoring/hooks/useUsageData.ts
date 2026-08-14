import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import {
  usageServiceApi,
  type ApiKeyAlias,
  type ApiKeyAliasesResponse,
  type ModelPricesResponse,
  type ModelPriceSyncOptions,
  type ModelPriceSyncResponse,
  type UsageClearResponse,
  type UsageExportResponse,
  type UsageImportResponse,
} from '@/services/api/usageService';
import { useAuthStore } from '@/stores';
import {
  loadModelPrices,
  normalizeModelPrices,
  saveModelPrices,
  type ModelPrice,
} from '@/utils/usage';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
	useResponseModelForBilling: boolean;
  apiKeyAliases: ApiKeyAlias[];
  usageServiceAvailable: boolean;
  setModelPrices: (prices: Record<string, ModelPrice>) => Promise<void>;
	setUseResponseModelForBilling: (enabled: boolean) => Promise<void>;
  loadApiKeyAliases: () => Promise<void>;
  syncModelPrices: (modelsOrOptions?: string[] | ModelPriceSyncOptions) => Promise<ModelPriceSyncResponse>;
  clearUsage: () => Promise<UsageClearResponse>;
  exportUsage: () => Promise<UsageExportResponse>;
  importUsage: (file: File) => Promise<UsageImportResponse>;
  loadUsage: () => Promise<void>;
}

export interface UseUsageDataOptions {
  loadUsageEvents?: boolean;
}

export function useUsageData({
  loadUsageEvents = true,
}: UseUsageDataOptions = {}): UseUsageDataReturn {
  const managementKey = useAuthStore((state) => state.managementKey);
  const featureAvailability = usePanelFeatureAvailability();
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [modelPrices, setModelPricesState] = useState<Record<string, ModelPrice>>({});
	const [useResponseModelForBilling, setUseResponseModelForBillingState] = useState(true);
  const [apiKeyAliases, setApiKeyAliases] = useState<ApiKeyAlias[]>([]);
  const [usageServiceAvailable, setUsageServiceAvailable] = useState(false);
  const requestIdRef = useRef(0);
  const aliasRequestIdRef = useRef(0);
  const modelPriceServiceBase =
    featureAvailability.modelPricesAvailable ? featureAvailability.serviceBase : '';
  const usageEventsServiceBase = featureAvailability.requestMonitoringAvailable
    ? featureAvailability.serviceBase
    : '';

  const getModelPricesFromApi = useCallback(async (): Promise<ModelPricesResponse> => {
    if (!modelPriceServiceBase) {
      return { prices: {} };
    }
    return usageServiceApi.getModelPrices(modelPriceServiceBase, managementKey);
  }, [managementKey, modelPriceServiceBase]);

  const getApiKeyAliasesFromApi = useCallback(async (): Promise<ApiKeyAliasesResponse> => {
    if (!modelPriceServiceBase) {
      return { items: [] };
    }
    return usageServiceApi.getApiKeyAliases(modelPriceServiceBase, managementKey);
  }, [managementKey, modelPriceServiceBase]);

  const saveModelPricesToApi = useCallback(
    async (
      prices: Record<string, ModelPrice>,
      useResponseModelForBilling?: boolean
    ): Promise<ModelPricesResponse> => {
      if (!modelPriceServiceBase) {
        throw new Error('model_price_api_unavailable');
      }
      return usageServiceApi.saveModelPrices(
        modelPriceServiceBase,
        prices,
        managementKey,
        useResponseModelForBilling
      );
    },
    [managementKey, modelPriceServiceBase]
  );

  const syncModelPricesFromApi = useCallback(
    async (modelsOrOptions?: string[] | ModelPriceSyncOptions): Promise<ModelPriceSyncResponse> => {
      if (!modelPriceServiceBase) {
        throw new Error('model_price_sync_requires_usage_service');
      }
      return usageServiceApi.syncModelPrices(modelPriceServiceBase, managementKey, modelsOrOptions);
    },
    [managementKey, modelPriceServiceBase]
  );

  const exportUsageFromApi = useCallback(async (): Promise<UsageExportResponse> => {
    if (!usageEventsServiceBase) {
      throw new Error('usage_import_export_requires_usage_service');
    }
    return usageServiceApi.exportUsage(usageEventsServiceBase, managementKey);
  }, [managementKey, usageEventsServiceBase]);

  const clearUsageFromApi = useCallback(async (): Promise<UsageClearResponse> => {
    if (!usageEventsServiceBase) {
      throw new Error('usage_import_export_requires_usage_service');
    }
    return usageServiceApi.clearUsage(usageEventsServiceBase, managementKey);
  }, [managementKey, usageEventsServiceBase]);

  const importUsageToApi = useCallback(
    async (file: File): Promise<UsageImportResponse> => {
      if (!usageEventsServiceBase) {
        throw new Error('usage_import_export_requires_usage_service');
      }
      return usageServiceApi.importUsage(usageEventsServiceBase, file, managementKey);
    },
    [managementKey, usageEventsServiceBase]
  );

  const loadModelPricesFromStorage = useCallback(async () => {
    const fallbackPrices = loadModelPrices();
    try {
      const response = await getModelPricesFromApi();
      const apiPrices = normalizeModelPrices(response.prices);
		setUseResponseModelForBillingState(response.use_response_model_for_billing !== false);
      if (Object.keys(apiPrices).length > 0) {
        setModelPricesState(apiPrices);
        saveModelPrices(apiPrices);
        return;
      }
      if (Object.keys(fallbackPrices).length > 0) {
		const migrated = await saveModelPricesToApi(fallbackPrices);
        const migratedPrices = normalizeModelPrices(migrated.prices ?? fallbackPrices);
        setModelPricesState(migratedPrices);
        saveModelPrices(migratedPrices);
        return;
      }
      setModelPricesState({});
    } catch {
      setModelPricesState(fallbackPrices);
    }
  }, [getModelPricesFromApi, saveModelPricesToApi]);

  const loadApiKeyAliases = useCallback(async () => {
    const requestId = aliasRequestIdRef.current + 1;
    aliasRequestIdRef.current = requestId;
    try {
      const response = await getApiKeyAliasesFromApi();
      if (aliasRequestIdRef.current !== requestId) return;
      setApiKeyAliases(Array.isArray(response.items) ? response.items : []);
    } catch {
      if (aliasRequestIdRef.current !== requestId) return;
      setApiKeyAliases([]);
    }
  }, [getApiKeyAliasesFromApi]);

  const loadUsage = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!loadUsageEvents) {
      setUsageServiceAvailable(false);
      setUsage(null);
      setLastRefreshedAt(null);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!usageEventsServiceBase) {
        setUsageServiceAvailable(false);
        setUsage(null);
        setLastRefreshedAt(null);
        return;
      }
      setUsageServiceAvailable(true);
      const payload = await usageServiceApi.getUsage(usageEventsServiceBase, managementKey, {
        includeDetails: true,
      });
      if (requestIdRef.current !== requestId) return;
      setUsage(payload ?? null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [loadUsageEvents, managementKey, usageEventsServiceBase]);

  useEffect(() => {
    void loadModelPricesFromStorage();
    void loadApiKeyAliases();
    void loadUsage();
  }, [loadApiKeyAliases, loadModelPricesFromStorage, loadUsage]);

  const setModelPrices = useCallback(
    async (prices: Record<string, ModelPrice>) => {
      const normalizedPrices = normalizeModelPrices(prices);
      setModelPricesState(normalizedPrices);
      try {
        const response = await saveModelPricesToApi(normalizedPrices);
        const savedPrices = normalizeModelPrices(response.prices ?? normalizedPrices);
        setModelPricesState(savedPrices);
        saveModelPrices(savedPrices);
      } catch {
        saveModelPrices(normalizedPrices);
      }
    },
    [saveModelPricesToApi]
  );

	const setUseResponseModelForBilling = useCallback(
		async (enabled: boolean) => {
			setUseResponseModelForBillingState(enabled);
			try {
        const response = await saveModelPricesToApi(modelPrices, enabled);
				setUseResponseModelForBillingState(response.use_response_model_for_billing !== false);
			} catch {
				// Keep the local setting when the management service is unavailable.
			}
		},
    [modelPrices, saveModelPricesToApi]
	);

  const syncModelPrices = useCallback(
    async (modelsOrOptions?: string[] | ModelPriceSyncOptions) => {
      const response = await syncModelPricesFromApi(modelsOrOptions);
      const syncedPrices = normalizeModelPrices(response.prices);
      setModelPricesState(syncedPrices);
      saveModelPrices(syncedPrices);
      return response;
    },
    [syncModelPricesFromApi]
  );

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
		useResponseModelForBilling,
    apiKeyAliases,
    usageServiceAvailable,
    setModelPrices,
		setUseResponseModelForBilling,
    loadApiKeyAliases,
    syncModelPrices,
    clearUsage: clearUsageFromApi,
    exportUsage: exportUsageFromApi,
    importUsage: importUsageToApi,
    loadUsage,
  };
}

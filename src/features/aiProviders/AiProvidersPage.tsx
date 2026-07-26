import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AmpcodeSection,
  ClaudeSection,
  CodexSection,
  GeminiSection,
  OpenAISection,
  VertexSection,
  ProviderNav,
  useProviderRecentRequests,
} from '@/components/providers';
import {
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderConfigKey,
  getProviderRecentStatusData,
  getProviderTotalStats,
  hasAmpcodeConfiguration,
  hasDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconSearch, IconSlidersHorizontal } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ampcodeApi, providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useThemeStore } from '@/stores';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import { STORAGE_KEY_AI_PROVIDERS_LIST_MODE } from '@/utils/constants';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { ProviderSheet, type ProviderSheetState } from '@/features/providers/sheets/ProviderSheet';
import { isSponsorPartialMutationError } from '@/features/providers/sponsorMutationRecovery';
import type {
  ProviderBrand,
  ProviderResource,
  ProviderSortBy,
  SortDir,
} from '@/features/providers/types';
import { useProviderWorkbench } from '@/features/providers/useProviderWorkbench';
import { ProviderResourceToolbar } from '@/features/providers/components/ProviderResourceToolbar';
import { AiProvidersUnifiedTable, type AiProviderListRow } from './AiProvidersUnifiedTable';
import {
  filterAndSortAiProviderRows,
  getAvailableAiProviderModels,
} from './aiProviderListControls';
import { AdditionalProviderSection } from './AdditionalProviderSection';
import {
  getAdditionalProviderCredentials,
  getAdditionalProviderStats,
  getAdditionalProviderStatusData,
} from './additionalProviderPresentation';
import styles from './AiProvidersPage.module.scss';

const maskProviderCredential = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
};

const getModelDetails = (models?: Array<{ name: string; alias?: string }>): string[] =>
  models?.map((model) => (model.alias ? `${model.name} (${model.alias})` : model.name)) ?? [];

const getModelNames = (models?: Array<{ name: string }>): string[] =>
  models?.map((model) => model.name.trim()).filter(Boolean) ?? [];

const compactSearchValues = (values: unknown[]): string[] =>
  values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

const getKeyConfigSearchValues = (
  config: GeminiKeyConfig | ProviderKeyConfig
): string[] =>
  compactSearchValues([
    config.apiKey,
    config.authIndex,
    config.proxyUrl,
    config.prefix,
    ...Object.entries(config.headers ?? {}).flat(),
    ...(config.excludedModels ?? []),
  ]);

const getOpenAIProviderSearchValues = (config: OpenAIProviderConfig): string[] =>
  compactSearchValues([
    config.authIndex,
    config.prefix,
    ...Object.entries(config.headers ?? {}).flat(),
    ...(config.apiKeyEntries ?? []).flatMap((entry) => [
      entry.apiKey,
      entry.authIndex,
      entry.proxyUrl,
      ...Object.entries(entry.headers ?? {}).flat(),
    ]),
  ]);

type LegacyProviderBrand = 'openai' | 'codex' | 'claude' | 'vertex' | 'gemini';

const ADDITIONAL_PROVIDER_BRANDS: ProviderBrand[] = [
  'xai',
  'claudeApi',
  'kimi',
  'code0',
  'fennoAI',
  'qiniuCloud',
];

const PROVIDER_PICKER_BRANDS: Array<LegacyProviderBrand | ProviderBrand> = [
  'openai',
  'claude',
  'codex',
  'gemini',
  'xai',
  'vertex',
  'claudeApi',
  'kimi',
  'code0',
  'fennoAI',
  'qiniuCloud',
];

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const hasMounted = useRef(false);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');
  const [listMode, setListMode] = useLocalStorage(STORAGE_KEY_AI_PROVIDERS_LIST_MODE, false);
  const [addProviderModalOpen, setAddProviderModalOpen] = useState(false);
  const [providerSheetState, setProviderSheetState] = useState<ProviderSheetState>({
    open: false,
    brand: 'xai',
    mode: 'create',
    resource: null,
  });

  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyConfig[]>(
    () => config?.geminiApiKeys || []
  );
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.codexApiKeys || []
  );
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.claudeApiKeys || []
  );
  const [vertexConfigs, setVertexConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.vertexApiKeys || []
  );
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProviderConfig[]>(
    () => config?.openaiCompatibility || []
  );
  const [providerListFilter, setProviderListFilter] = useState('');
  const [providerListSortBy, setProviderListSortBy] = useState<ProviderSortBy>('name');
  const [providerListSortDir, setProviderListSortDir] = useState<SortDir>('asc');
  const [providerListSelectedModels, setProviderListSelectedModels] = useState<Set<string>>(
    () => new Set()
  );

  const [configSwitchingKey, setConfigSwitchingKey] = useState<string | null>(null);

  const disableControls = connectionStatus !== 'connected';
  const isSwitching = Boolean(configSwitchingKey);

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const { usageByProvider, loadRecentRequests, refreshRecentRequests } = useProviderRecentRequests({
    enabled: isCurrentLayer,
  });
  const providerWorkbench = useProviderWorkbench();
  const refetchProviderWorkbench = providerWorkbench.refetch;

  const resourcesByBrand = useMemo(
    () =>
      new Map(
        (providerWorkbench.snapshot?.groups ?? []).map((group) => [group.id, group.resources])
      ),
    [providerWorkbench.snapshot]
  );
  const additionalProviderGroups = useMemo(
    () =>
      ADDITIONAL_PROVIDER_BRANDS.map((brand) => ({
        brand,
        resources: resourcesByBrand.get(brand) ?? [],
      })),
    [resourcesByBrand]
  );

  const nativeGeminiResources = resourcesByBrand.get('gemini');
  const nativeCodexResources = resourcesByBrand.get('codex');
  const nativeClaudeResources = resourcesByBrand.get('claude');
  const nativeVertexResources = resourcesByBrand.get('vertex');
  const nativeOpenAIResources = resourcesByBrand.get('openaiCompatibility');

  const displayedGeminiKeys = nativeGeminiResources
    ? nativeGeminiResources.map((resource) => resource.raw as GeminiKeyConfig)
    : geminiKeys;
  const displayedCodexConfigs = nativeCodexResources
    ? nativeCodexResources.map((resource) => resource.raw as ProviderKeyConfig)
    : codexConfigs;
  const displayedClaudeConfigs = nativeClaudeResources
    ? nativeClaudeResources.map((resource) => resource.raw as ProviderKeyConfig)
    : claudeConfigs;
  const displayedVertexConfigs = nativeVertexResources
    ? nativeVertexResources.map((resource) => resource.raw as ProviderKeyConfig)
    : vertexConfigs;
  const displayedOpenAIProviders = nativeOpenAIResources
    ? nativeOpenAIResources.map((resource) => resource.raw as OpenAIProviderConfig)
    : openaiProviders;

  const resolveSourceIndex = (
    resources: ProviderResource[] | undefined,
    displayedIndex: number
  ): number => resources?.[displayedIndex]?.originalIndex ?? displayedIndex;

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return '';
  };

  const loadConfigs = useCallback(async () => {
    const hasValidCache = isCacheValid();
    if (!hasValidCache) {
      setLoading(true);
    }
    setError('');
    try {
      const [configResult, vertexResult, ampcodeResult, openaiResult] = await Promise.allSettled([
        fetchConfig(),
        providersApi.getVertexConfigs(),
        ampcodeApi.getAmpcode(),
        providersApi.getOpenAIProviders(),
      ]);

      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }

      const data = configResult.value;
      setGeminiKeys(data?.geminiApiKeys || []);
      setCodexConfigs(data?.codexApiKeys || []);
      setClaudeConfigs(data?.claudeApiKeys || []);
      setVertexConfigs(data?.vertexApiKeys || []);
      setOpenaiProviders(data?.openaiCompatibility || []);

      if (vertexResult.status === 'fulfilled') {
        setVertexConfigs(vertexResult.value || []);
        updateConfigValue('vertex-api-key', vertexResult.value || []);
        clearCache('vertex-api-key');
      }

      if (ampcodeResult.status === 'fulfilled') {
        updateConfigValue('ampcode', ampcodeResult.value);
        clearCache('ampcode');
      }

      if (openaiResult.status === 'fulfilled') {
        setOpenaiProviders(openaiResult.value || []);
        updateConfigValue('openai-compatibility', openaiResult.value || []);
        clearCache('openai-compatibility');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clearCache, fetchConfig, isCacheValid, t, updateConfigValue]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadRecentRequests().catch(() => {});
  }, [isCurrentLayer, loadRecentRequests]);

  useEffect(() => {
    if (config?.geminiApiKeys) setGeminiKeys(config.geminiApiKeys);
    if (config?.codexApiKeys) setCodexConfigs(config.codexApiKeys);
    if (config?.claudeApiKeys) setClaudeConfigs(config.claudeApiKeys);
    if (config?.vertexApiKeys) setVertexConfigs(config.vertexApiKeys);
    if (config?.openaiCompatibility) setOpenaiProviders(config.openaiCompatibility);
  }, [
    config?.geminiApiKeys,
    config?.codexApiKeys,
    config?.claudeApiKeys,
    config?.vertexApiKeys,
    config?.openaiCompatibility,
  ]);

  const handleRecentRequestsRefresh = useCallback(async () => {
    await Promise.all([refreshRecentRequests(), refetchProviderWorkbench()]);
  }, [refetchProviderWorkbench, refreshRecentRequests]);

  useHeaderRefresh(handleRecentRequestsRefresh, isCurrentLayer);

  const openEditor = useCallback(
    (path: string) => {
      navigate(path, { state: { fromAiProviders: true } });
    },
    [navigate]
  );

  const openProviderEditor = (provider: LegacyProviderBrand) => {
    setAddProviderModalOpen(false);
    openEditor('/ai-providers/' + provider + '/new');
  };

  const openAdditionalProviderEditor = (
    brand: ProviderBrand,
    resource: ProviderResource | null = null
  ) => {
    setAddProviderModalOpen(false);
    setProviderSheetState({
      open: true,
      brand,
      mode: resource ? 'edit' : 'create',
      resource,
    });
  };

  const closeAdditionalProviderEditor = () => {
    setProviderSheetState((current) => ({ ...current, open: false }));
  };

  const handleProviderPickerSelection = (provider: LegacyProviderBrand | ProviderBrand) => {
    if (
      provider === 'openai' ||
      provider === 'codex' ||
      provider === 'claude' ||
      provider === 'vertex' ||
      provider === 'gemini'
    ) {
      openProviderEditor(provider);
      return;
    }
    openAdditionalProviderEditor(provider);
  };

  const deleteAdditionalProvider = (resource: ProviderResource) => {
    const name = resource.name ?? resource.apiKeyPreview ?? resource.identifier;
    showConfirmation({
      title: t('providersPage.delete.title'),
      message: t('providersPage.delete.confirm', { name }),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providerWorkbench.deleteProvider(resource);
          showNotification(t('providersPage.toast.deleted'), 'success');
        } catch (err: unknown) {
          if (isSponsorPartialMutationError(err)) {
            showNotification(t('providersPage.sponsor.partialMutationWarning'), 'warning');
            return;
          }
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteAmpcode = () => {
    const ampcode = config?.ampcode;
    if (!hasAmpcodeConfiguration(ampcode)) return;

    showConfirmation({
      title: t('providersPage.delete.title'),
      message: t('providersPage.delete.confirm', {
        name: t('ai_providers.provider_ampcode'),
      }),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        setConfigSwitchingKey('ampcode:delete');
        try {
          const operations: Promise<unknown>[] = [];
          if (ampcode.upstreamUrl?.trim()) operations.push(ampcodeApi.clearUpstreamUrl());
          if (ampcode.upstreamApiKey?.trim()) operations.push(ampcodeApi.clearUpstreamApiKey());
          if (ampcode.upstreamApiKeys?.length) {
            operations.push(
              ampcodeApi.deleteUpstreamApiKeys(
                ampcode.upstreamApiKeys.map((entry) => entry.upstreamApiKey)
              )
            );
          }
          if (ampcode.modelMappings?.length) operations.push(ampcodeApi.clearModelMappings());
          if (ampcode.forceModelMappings === true) {
            operations.push(ampcodeApi.updateForceModelMappings(false));
          }

          const results = await Promise.allSettled(operations);
          const failed = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
          );
          if (failed) throw failed.reason;

          updateConfigValue('ampcode', {});
          clearCache('ampcode');
          showNotification(t('providersPage.toast.deleted'), 'success');
        } catch (err: unknown) {
          await loadConfigs();
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        } finally {
          setConfigSwitchingKey(null);
        }
      },
    });
  };

  const setAdditionalProviderEnabled = async (resource: ProviderResource, enabled: boolean) => {
    try {
      await providerWorkbench.toggleDisabled(resource, !enabled);
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      if (isSponsorPartialMutationError(err)) {
        showNotification(t('providersPage.sponsor.partialMutationWarning'), 'warning');
        return;
      }
      const message = getErrorMessage(err);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    }
  };

  const deleteGemini = async (index: number) => {
    const entry = geminiKeys[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.gemini_delete_title', { defaultValue: 'Delete Gemini Key' }),
      message: t('ai_providers.gemini_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteGeminiKey(entry.apiKey, entry.baseUrl);
          const next = geminiKeys.filter((_, idx) => idx !== index);
          setGeminiKeys(next);
          updateConfigValue('gemini-api-key', next);
          clearCache('gemini-api-key');
          showNotification(t('notification.gemini_key_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const setConfigEnabled = async (
    provider: 'gemini' | 'codex' | 'claude' | 'vertex',
    index: number,
    enabled: boolean
  ) => {
    if (provider === 'gemini') {
      const current = geminiKeys[index];
      if (!current) return;

      const switchingKey = `${provider}:${current.apiKey}`;
      setConfigSwitchingKey(switchingKey);

      const previousList = geminiKeys;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: GeminiKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

      setGeminiKeys(nextList);
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');

      try {
        await providersApi.saveGeminiKeys(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setGeminiKeys(previousList);
        updateConfigValue('gemini-api-key', previousList);
        clearCache('gemini-api-key');
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        setConfigSwitchingKey(null);
      }
      return;
    }

    const source =
      provider === 'codex' ? codexConfigs : provider === 'claude' ? claudeConfigs : vertexConfigs;
    const current = source[index];
    if (!current) return;

    const switchingKey = `${provider}:${current.apiKey}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = source;
    const nextExcluded = enabled
      ? withoutDisableAllModelsRule(current.excludedModels)
      : withDisableAllModelsRule(current.excludedModels);
    const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    if (provider === 'codex') {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
    } else if (provider === 'claude') {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    } else {
      setVertexConfigs(nextList);
      updateConfigValue('vertex-api-key', nextList);
      clearCache('vertex-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else if (provider === 'claude') {
        await providersApi.saveClaudeConfigs(nextList);
      } else {
        await providersApi.saveVertexConfigs(nextList);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (provider === 'codex') {
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
      } else if (provider === 'claude') {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      } else {
        setVertexConfigs(previousList);
        updateConfigValue('vertex-api-key', previousList);
        clearCache('vertex-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const setOpenAIProviderEnabled = async (index: number, enabled: boolean) => {
    const current = openaiProviders[index];
    if (!current) return;

    const switchingKey = `openai:${current.name}:${index}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = openaiProviders;
    const nextItem: OpenAIProviderConfig = { ...current, disabled: !enabled };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    setOpenaiProviders(nextList);
    updateConfigValue('openai-compatibility', nextList);
    clearCache('openai-compatibility');

    try {
      await providersApi.updateOpenAIProviderDisabled(index, !enabled);
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setOpenaiProviders(previousList);
      updateConfigValue('openai-compatibility', previousList);
      clearCache('openai-compatibility');
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const deleteProviderEntry = async (type: 'codex' | 'claude', index: number) => {
    const source = type === 'codex' ? codexConfigs : claudeConfigs;
    const entry = source[index];
    if (!entry) return;
    showConfirmation({
      title: t(`ai_providers.${type}_delete_title`, {
        defaultValue: `Delete ${type === 'codex' ? 'Codex' : 'Claude'} Config`,
      }),
      message: t(`ai_providers.${type}_delete_confirm`),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          if (type === 'codex') {
            await providersApi.deleteCodexConfig(entry.apiKey, entry.baseUrl);
            const next = codexConfigs.filter((_, idx) => idx !== index);
            setCodexConfigs(next);
            updateConfigValue('codex-api-key', next);
            clearCache('codex-api-key');
            showNotification(t('notification.codex_config_deleted'), 'success');
          } else {
            await providersApi.deleteClaudeConfig(entry.apiKey, entry.baseUrl);
            const next = claudeConfigs.filter((_, idx) => idx !== index);
            setClaudeConfigs(next);
            updateConfigValue('claude-api-key', next);
            clearCache('claude-api-key');
            showNotification(t('notification.claude_config_deleted'), 'success');
          }
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteVertex = async (index: number) => {
    const entry = vertexConfigs[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.vertex_delete_title', { defaultValue: 'Delete Vertex Config' }),
      message: t('ai_providers.vertex_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteVertexConfig(entry.apiKey, entry.baseUrl);
          const next = vertexConfigs.filter((_, idx) => idx !== index);
          setVertexConfigs(next);
          updateConfigValue('vertex-api-key', next);
          clearCache('vertex-api-key');
          showNotification(t('notification.vertex_config_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteOpenai = async (index: number) => {
    const entry = openaiProviders[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.openai_delete_title', { defaultValue: 'Delete OpenAI Provider' }),
      message: t('ai_providers.openai_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteOpenAIProvider(entry.name);
          const next = openaiProviders.filter((_, idx) => idx !== index);
          setOpenaiProviders(next);
          updateConfigValue('openai-compatibility', next);
          clearCache('openai-compatibility');
          showNotification(t('notification.openai_provider_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const allUnifiedRows: AiProviderListRow[] = (() => {
    const rows: AiProviderListRow[] = [];

    displayedGeminiKeys.forEach((item, displayedIndex) => {
      const index = resolveSourceIndex(nativeGeminiResources, displayedIndex);
      const stats = getProviderTotalStats(usageByProvider, 'gemini', item.apiKey, item.baseUrl);
      rows.push({
        id: `gemini:${getProviderConfigKey(item, index)}`,
        provider: t('ai_providers.provider_gemini'),
        name: t('ai_providers.gemini_item_title'),
        baseUrl: item.baseUrl || '',
        credential: t('ai_providers.unified_credentials_count', { count: item.apiKey ? 1 : 0 }),
        credentialDetails: item.apiKey ? [maskProviderCredential(item.apiKey)] : [],
        modelCount: item.models?.length ?? 0,
        modelDetails: getModelDetails(item.models),
        filterModels: getModelNames(item.models),
        searchValues: getKeyConfigSearchValues(item),
        priority: item.priority ?? 0,
        success: stats.success,
        failure: stats.failure,
        statusData: getProviderRecentStatusData(
          usageByProvider,
          'gemini',
          item.apiKey,
          item.baseUrl
        ),
        disabled: hasDisableAllModelsRule(item.excludedModels),
        canToggle: true,
        canDelete: true,
        onEdit: () => openEditor(`/ai-providers/gemini/${index}`),
        onDelete: () => void deleteGemini(index),
        onToggle: (enabled) => void setConfigEnabled('gemini', index, enabled),
      });
    });

    displayedCodexConfigs.forEach((item, displayedIndex) => {
      const index = resolveSourceIndex(nativeCodexResources, displayedIndex);
      const stats = getProviderTotalStats(usageByProvider, 'codex', item.apiKey, item.baseUrl);
      rows.push({
        id: `codex:${getProviderConfigKey(item, index)}`,
        provider: t('ai_providers.provider_codex'),
        name: item.name || t('ai_providers.codex_item_title'),
        baseUrl: item.baseUrl || '',
        credential: t('ai_providers.unified_credentials_count', { count: item.apiKey ? 1 : 0 }),
        credentialDetails: item.apiKey ? [maskProviderCredential(item.apiKey)] : [],
        modelCount: item.models?.length ?? 0,
        modelDetails: getModelDetails(item.models),
        filterModels: getModelNames(item.models),
        searchValues: getKeyConfigSearchValues(item),
        priority: item.priority ?? 0,
        success: stats.success,
        failure: stats.failure,
        statusData: getProviderRecentStatusData(
          usageByProvider,
          'codex',
          item.apiKey,
          item.baseUrl
        ),
        disabled: hasDisableAllModelsRule(item.excludedModels),
        canToggle: true,
        canDelete: true,
        onEdit: () => openEditor(`/ai-providers/codex/${index}`),
        onDelete: () => void deleteProviderEntry('codex', index),
        onToggle: (enabled) => void setConfigEnabled('codex', index, enabled),
      });
    });

    displayedClaudeConfigs.forEach((item, displayedIndex) => {
      const index = resolveSourceIndex(nativeClaudeResources, displayedIndex);
      const stats = getProviderTotalStats(usageByProvider, 'claude', item.apiKey, item.baseUrl);
      rows.push({
        id: `claude:${getProviderConfigKey(item, index)}`,
        provider: t('ai_providers.provider_claude'),
        name: item.name || t('ai_providers.claude_item_title'),
        baseUrl: item.baseUrl || '',
        credential: t('ai_providers.unified_credentials_count', { count: item.apiKey ? 1 : 0 }),
        credentialDetails: item.apiKey ? [maskProviderCredential(item.apiKey)] : [],
        modelCount: item.models?.length ?? 0,
        modelDetails: getModelDetails(item.models),
        filterModels: getModelNames(item.models),
        searchValues: getKeyConfigSearchValues(item),
        priority: item.priority ?? 0,
        success: stats.success,
        failure: stats.failure,
        statusData: getProviderRecentStatusData(
          usageByProvider,
          'claude',
          item.apiKey,
          item.baseUrl
        ),
        disabled: hasDisableAllModelsRule(item.excludedModels),
        canToggle: true,
        canDelete: true,
        onEdit: () => openEditor(`/ai-providers/claude/${index}`),
        onDelete: () => void deleteProviderEntry('claude', index),
        onToggle: (enabled) => void setConfigEnabled('claude', index, enabled),
      });
    });

    displayedVertexConfigs.forEach((item, displayedIndex) => {
      const index = resolveSourceIndex(nativeVertexResources, displayedIndex);
      const stats = getProviderTotalStats(usageByProvider, 'vertex', item.apiKey, item.baseUrl);
      rows.push({
        id: `vertex:${getProviderConfigKey(item, index)}`,
        provider: t('ai_providers.provider_vertex'),
        name: item.name || t('ai_providers.vertex_item_title'),
        baseUrl: item.baseUrl || '',
        credential: t('ai_providers.unified_credentials_count', { count: item.apiKey ? 1 : 0 }),
        credentialDetails: item.apiKey ? [maskProviderCredential(item.apiKey)] : [],
        modelCount: item.models?.length ?? 0,
        modelDetails: getModelDetails(item.models),
        filterModels: getModelNames(item.models),
        searchValues: getKeyConfigSearchValues(item),
        priority: item.priority ?? 0,
        success: stats.success,
        failure: stats.failure,
        statusData: getProviderRecentStatusData(
          usageByProvider,
          'vertex',
          item.apiKey,
          item.baseUrl
        ),
        disabled: hasDisableAllModelsRule(item.excludedModels),
        canToggle: true,
        canDelete: true,
        onEdit: () => openEditor(`/ai-providers/vertex/${index}`),
        onDelete: () => void deleteVertex(index),
        onToggle: (enabled) => void setConfigEnabled('vertex', index, enabled),
      });
    });

    displayedOpenAIProviders.forEach((item, displayedIndex) => {
      const index = resolveSourceIndex(nativeOpenAIResources, displayedIndex);
      const stats = getOpenAIProviderTotalStats(item, usageByProvider);
      rows.push({
        id: `openai:${item.name}:${index}`,
        provider: t('ai_providers.provider_openai'),
        name: item.name,
        baseUrl: item.baseUrl,
        credential: t('ai_providers.unified_credentials_count', {
          count: item.apiKeyEntries?.length ?? 0,
        }),
        credentialDetails: item.apiKeyEntries?.map((entry) => maskProviderCredential(entry.apiKey)),
        modelCount: item.models?.length ?? 0,
        modelDetails: getModelDetails(item.models),
        filterModels: getModelNames(item.models),
        searchValues: getOpenAIProviderSearchValues(item),
        priority: item.priority ?? 0,
        success: stats.success,
        failure: stats.failure,
        statusData: getOpenAIProviderRecentStatusData(item, usageByProvider),
        disabled: item.disabled === true,
        canToggle: true,
        canDelete: true,
        onEdit: () => openEditor(`/ai-providers/openai/${index}`),
        onDelete: () => void deleteOpenai(index),
        onToggle: (enabled) => void setOpenAIProviderEnabled(index, enabled),
      });
    });

    const ampcode = config?.ampcode;
    if (hasAmpcodeConfiguration(ampcode)) {
      const ampcodeCredentialDetails = [
        ...(ampcode.upstreamApiKey
          ? [maskProviderCredential(ampcode.upstreamApiKey)]
          : []),
        ...(ampcode.upstreamApiKeys ?? []).map((entry) =>
          maskProviderCredential(entry.upstreamApiKey)
        ),
      ];
      rows.push({
        id: 'ampcode',
        provider: t('ai_providers.provider_ampcode'),
        name: t('ai_providers.ampcode_title'),
        baseUrl: ampcode.upstreamUrl || '',
        credential: t('ai_providers.unified_credentials_count', {
          count: ampcodeCredentialDetails.length,
        }),
        credentialDetails: ampcodeCredentialDetails,
        modelCount: ampcode.modelMappings?.length ?? 0,
        modelDetails: ampcode.modelMappings?.map((mapping) => `${mapping.from} → ${mapping.to}`),
        filterModels: ampcode.modelMappings?.flatMap((mapping) => [mapping.from, mapping.to]),
        searchValues: compactSearchValues([
          ampcode.upstreamApiKey,
          ...(ampcode.upstreamApiKeys ?? []).map((entry) => entry.upstreamApiKey),
          ...(ampcode.modelMappings ?? []).flatMap((mapping) => [mapping.from, mapping.to]),
        ]),
        priority: 0,
        statusLabel: t('ai_providers.unified_configured'),
        success: 0,
        failure: 0,
        statusData: statusBarDataFromRecentRequests([]),
        disabled: false,
        canToggle: false,
        canDelete: true,
        onEdit: () => openEditor('/ai-providers/ampcode'),
        onDelete: deleteAmpcode,
      });
    }

    additionalProviderGroups.forEach(({ brand, resources }) => {
      resources.forEach((resource) => {
        const stats = getAdditionalProviderStats(resource, usageByProvider);
        const credentials = getAdditionalProviderCredentials(resource, usageByProvider);
        rows.push({
          id: resource.id,
          provider: t(`providersPage.providerNames.${brand}`),
          name: resource.name ?? t(`providersPage.providerNames.${brand}`),
          baseUrl: resource.baseUrl ?? '',
          credential: t('ai_providers.unified_credentials_count', {
            count: credentials.length,
          }),
          credentialDetails: credentials.map((entry) => maskProviderCredential(entry.apiKey)),
          modelCount: resource.modelCount,
          modelDetails:
            resource.models.length > 0
              ? resource.models
              : resource.flags.protocols?.map((protocol) =>
                  t(`providersPage.sponsor.protocols.${protocol}`)
                ),
          filterModels: resource.models,
          searchValues: compactSearchValues([
            resource.identifier,
            resource.apiKey,
            resource.authIndex,
            resource.proxyUrl,
            resource.prefix,
            ...credentials.flatMap((entry) => [entry.apiKey, entry.proxyUrl]),
            ...(resource.flags.protocols ?? []),
          ]),
          priority: resource.priority,
          success: stats.success,
          failure: stats.failure,
          statusData: getAdditionalProviderStatusData(resource, usageByProvider),
          disabled: resource.disabled,
          canToggle: true,
          canDelete: true,
          onEdit: () => openAdditionalProviderEditor(brand, resource),
          onDelete: () => deleteAdditionalProvider(resource),
          onToggle: (enabled) => void setAdditionalProviderEnabled(resource, enabled),
        });
      });
    });

    return rows;
  })();

  const availableProviderModels = getAvailableAiProviderModels(allUnifiedRows);
  const availableProviderModelSet = new Set(availableProviderModels);
  const activeProviderModels = new Set(
    Array.from(providerListSelectedModels).filter((model) => availableProviderModelSet.has(model))
  );
  const unifiedRows = filterAndSortAiProviderRows(allUnifiedRows, {
    filter: providerListFilter,
    sortBy: providerListSortBy,
    sortDir: providerListSortDir,
    selectedModels: activeProviderModels,
  });

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {error && <div className="error-box">{error}</div>}

        <div className={styles.displayOptionsItem}>
          <Button
            size="sm"
            onClick={() => setAddProviderModalOpen(true)}
            disabled={disableControls || loading}
          >
            <IconPlus size={15} />
            {t('ai_providers.add_provider')}
          </Button>
          <DropdownMenu
            ariaLabel={t('ai_providers.display_options_label')}
            triggerLabel={t('ai_providers.display_options_label')}
            triggerIcon={<IconSlidersHorizontal size={15} />}
            triggerClassName={styles.displayOptionsTrigger}
            items={[
              {
                key: 'display-options',
                label: t('ai_providers.display_options_label'),
                content: (
                  <div className={styles.displayOptionsMenu}>
                    <ToggleSwitch
                      checked={listMode}
                      onChange={setListMode}
                      ariaLabel={t('ai_providers.list_mode_label')}
                      label={t('ai_providers.list_mode_label')}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>

        {listMode ? (
          <div className={styles.unifiedProviderListView}>
            <div className={styles.unifiedProviderControls}>
              <div className={styles.unifiedProviderSearch}>
                <span className={styles.unifiedProviderSearchIcon} aria-hidden="true">
                  <IconSearch size={16} />
                </span>
                <input
                  type="search"
                  className={styles.unifiedProviderSearchInput}
                  value={providerListFilter}
                  onChange={(event) => setProviderListFilter(event.target.value)}
                  placeholder={t('providersPage.table.filterPlaceholder')}
                />
              </div>
              <ProviderResourceToolbar
                sortBy={providerListSortBy}
                sortDir={providerListSortDir}
                onSortBy={setProviderListSortBy}
                onSortDir={setProviderListSortDir}
                availableModels={availableProviderModels}
                selectedModels={activeProviderModels}
                onSelectedModelsChange={setProviderListSelectedModels}
              />
            </div>
            <AiProvidersUnifiedTable
              rows={unifiedRows}
              loading={loading}
              actionsDisabled={disableControls || loading || isSwitching}
            />
          </div>
        ) : (
          <>
            <div id="provider-openai">
              <OpenAISection
                configs={displayedOpenAIProviders}
                usageByProvider={usageByProvider}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                resolvedTheme={resolvedTheme}
                onAdd={() => openEditor('/ai-providers/openai/new')}
                onEdit={(index) =>
                  openEditor(
                    `/ai-providers/openai/${resolveSourceIndex(nativeOpenAIResources, index)}`
                  )
                }
                onDelete={(index) =>
                  void deleteOpenai(resolveSourceIndex(nativeOpenAIResources, index))
                }
                onToggle={(index, enabled) =>
                  void setOpenAIProviderEnabled(
                    resolveSourceIndex(nativeOpenAIResources, index),
                    enabled
                  )
                }
              />
            </div>

            <div id="provider-codex">
              <CodexSection
                configs={displayedCodexConfigs}
                usageByProvider={usageByProvider}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                onAdd={() => openEditor('/ai-providers/codex/new')}
                onEdit={(index) =>
                  openEditor(
                    `/ai-providers/codex/${resolveSourceIndex(nativeCodexResources, index)}`
                  )
                }
                onDelete={(index) =>
                  void deleteProviderEntry('codex', resolveSourceIndex(nativeCodexResources, index))
                }
                onToggle={(index, enabled) =>
                  void setConfigEnabled(
                    'codex',
                    resolveSourceIndex(nativeCodexResources, index),
                    enabled
                  )
                }
              />
            </div>

            <div id="provider-claude">
              <ClaudeSection
                configs={displayedClaudeConfigs}
                usageByProvider={usageByProvider}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                onAdd={() => openEditor('/ai-providers/claude/new')}
                onEdit={(index) =>
                  openEditor(
                    `/ai-providers/claude/${resolveSourceIndex(nativeClaudeResources, index)}`
                  )
                }
                onDelete={(index) =>
                  void deleteProviderEntry(
                    'claude',
                    resolveSourceIndex(nativeClaudeResources, index)
                  )
                }
                onToggle={(index, enabled) =>
                  void setConfigEnabled(
                    'claude',
                    resolveSourceIndex(nativeClaudeResources, index),
                    enabled
                  )
                }
              />
            </div>

            <div id="provider-vertex">
              <VertexSection
                configs={displayedVertexConfigs}
                usageByProvider={usageByProvider}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                onAdd={() => openEditor('/ai-providers/vertex/new')}
                onEdit={(index) =>
                  openEditor(
                    `/ai-providers/vertex/${resolveSourceIndex(nativeVertexResources, index)}`
                  )
                }
                onDelete={(index) =>
                  void deleteVertex(resolveSourceIndex(nativeVertexResources, index))
                }
                onToggle={(index, enabled) =>
                  void setConfigEnabled(
                    'vertex',
                    resolveSourceIndex(nativeVertexResources, index),
                    enabled
                  )
                }
              />
            </div>

            <div id="provider-ampcode">
              <AmpcodeSection
                config={config?.ampcode}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                onEdit={() => openEditor('/ai-providers/ampcode')}
              />
            </div>

            <div id="provider-gemini">
              <GeminiSection
                configs={displayedGeminiKeys}
                usageByProvider={usageByProvider}
                loading={loading}
                disableControls={disableControls}
                isSwitching={isSwitching}
                onAdd={() => openEditor('/ai-providers/gemini/new')}
                onEdit={(index) =>
                  openEditor(
                    `/ai-providers/gemini/${resolveSourceIndex(nativeGeminiResources, index)}`
                  )
                }
                onDelete={(index) =>
                  void deleteGemini(resolveSourceIndex(nativeGeminiResources, index))
                }
                onToggle={(index, enabled) =>
                  void setConfigEnabled(
                    'gemini',
                    resolveSourceIndex(nativeGeminiResources, index),
                    enabled
                  )
                }
              />
            </div>

            {additionalProviderGroups.map(({ brand, resources }) => (
              <div id={`provider-${brand}`} key={brand}>
                <AdditionalProviderSection
                  brand={brand}
                  resources={resources}
                  usageByProvider={usageByProvider}
                  loading={loading || providerWorkbench.isPending}
                  actionsDisabled={
                    disableControls ||
                    loading ||
                    providerWorkbench.mutating ||
                    providerWorkbench.isFetching
                  }
                  resolvedTheme={resolvedTheme}
                  onAdd={() => openAdditionalProviderEditor(brand)}
                  onEdit={(resource) => openAdditionalProviderEditor(brand, resource)}
                  onDelete={deleteAdditionalProvider}
                  onToggle={(resource, enabled) =>
                    void setAdditionalProviderEnabled(resource, enabled)
                  }
                />
              </div>
            ))}
          </>
        )}
      </div>

      <Modal
        open={addProviderModalOpen}
        title={t('ai_providers.add_provider_title')}
        onClose={() => setAddProviderModalOpen(false)}
        width={520}
      >
        <div className={styles.providerTypeList}>
          {PROVIDER_PICKER_BRANDS.map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              className={styles.providerTypeButton}
              onClick={() => handleProviderPickerSelection(provider)}
              disabled={disableControls || loading}
            >
              {provider === 'openai'
                ? t('ai_providers.provider_openai')
                : provider === 'codex' ||
                    provider === 'claude' ||
                    provider === 'vertex' ||
                    provider === 'gemini'
                  ? t(`ai_providers.provider_${provider}`)
                  : t(`providersPage.providerNames.${provider}`)}
            </Button>
          ))}
        </div>
      </Modal>

      <ProviderSheet
        state={providerSheetState}
        onClose={closeAdditionalProviderEditor}
        onSwitchToEdit={() => {
          setProviderSheetState((current) =>
            current.resource ? { ...current, mode: 'edit' } : current
          );
        }}
        workbench={providerWorkbench}
        onCreated={() => {
          showNotification(t('providersPage.toast.created'), 'success');
          closeAdditionalProviderEditor();
        }}
        onUpdated={() => {
          showNotification(t('providersPage.toast.updated'), 'success');
          closeAdditionalProviderEditor();
        }}
        mutationDisabled={
          disableControls || providerWorkbench.mutating || providerWorkbench.isFetching
        }
        usageByProvider={usageByProvider}
      />

      {!listMode && <ProviderNav />}
    </div>
  );
}

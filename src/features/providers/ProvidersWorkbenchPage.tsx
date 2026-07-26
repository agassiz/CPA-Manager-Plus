import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconSlidersHorizontal } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore } from '@/stores';
import { useProviderRecentRequests } from '@/components/providers/hooks/useProviderRecentRequests';
import {
  getOpenAIProviderRecentWindowStats,
  getProviderRecentWindowStats,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import { ProviderHeaderCard } from './components/ProviderHeaderCard';
import { ProviderResourcePanel } from './components/ProviderResourcePanel';
import type { ProviderPanelControls } from './components/ProviderResourcePanel';
import { SponsorQuickStartPanel } from './components/SponsorQuickStartPanel';
import { ProviderSheet, type ProviderSheetHandle } from './sheets/ProviderSheet';
import { APIKEY_FUN_DISPLAY_NAME } from './sponsor';
import { PROVIDER_LOGOS } from './brandLogos';
import { STORAGE_KEY_AI_PROVIDERS_LIST_MODE } from '@/utils/constants';
import { isMultiProtocolSponsorBrand } from './sponsorDefinitions';
import { isSponsorPartialMutationError } from './sponsorMutationRecovery';
import { useProviderWorkbench } from './useProviderWorkbench';
import {
  getProviderFilterState,
  readProvidersWorkbenchUiState,
  writeProvidersWorkbenchUiState,
  type ProviderFilterState,
  type ProvidersWorkbenchUiState,
} from './uiState';
import type { ProviderBrand, ProviderGroup, ProviderResource, ProviderSortBy, SortDir } from './types';
import styles from './ProvidersWorkbenchPage.module.scss';
import legacyStyles from '@/features/aiProviders/AiProvidersPage.module.scss';

type SheetMode = 'detail' | 'create' | 'edit';

interface SheetState {
  open: boolean;
  brand: ProviderBrand;
  mode: SheetMode;
  resource: ProviderResource | null;
}

interface ProvidersWorkbenchPageProps {
  fixedBrand?: ProviderBrand;
}

interface ProviderGroupView {
  group: ProviderGroup;
  filterState: ProviderFilterState;
  availableModels: string[];
  selectedModels: Set<string>;
  visibleResources: ProviderResource[];
}

const formatDateTime = (iso: string, locale?: string) => {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return iso;
  }
};

const matchesFilter = (r: ProviderResource, normalized: string): boolean => {
  if (!normalized) return true;
  const haystack = [
    r.identifier,
    r.name,
    r.authIndex,
    r.apiKeyPreview,
    r.apiKey,
    r.baseUrl,
    r.proxyUrl,
    r.prefix,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return haystack.some((v) => v.includes(normalized));
};

const getResourceSortName = (resource: ProviderResource): string =>
  (resource.name ?? resource.identifier ?? resource.apiKeyPreview ?? '').toLowerCase();

const getResourceRecentSuccess = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): number => {
  if (isMultiProtocolSponsorBrand(resource.brand)) {
    return 0;
  }
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderRecentWindowStats(resource.raw as OpenAIProviderConfig, usageByProvider)
      .success;
  }
  const usageProvider = resource.brand === 'claudeApi' ? 'claude' : resource.brand;
  return getProviderRecentWindowStats(
    usageByProvider,
    usageProvider,
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  ).success;
};

export function ProvidersWorkbenchPage({ fixedBrand }: ProvidersWorkbenchPageProps = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const workbench = useProviderWorkbench();
  const [uiState, setUiState] = useState<ProvidersWorkbenchUiState>(readProvidersWorkbenchUiState);
  const [listMode, setListMode] = useLocalStorage(STORAGE_KEY_AI_PROVIDERS_LIST_MODE, false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [sheetState, setSheetState] = useState<SheetState>({
    open: false,
    brand: 'gemini',
    mode: 'detail',
    resource: null,
  });
  const sheetRef = useRef<ProviderSheetHandle>(null);

  const connected = connectionStatus === 'connected';
  const { usageByProvider, refreshRecentRequests } = useProviderRecentRequests({
    enabled: connected,
  });

  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([workbench.refetch(), refreshRecentRequests().catch(() => undefined)]);
  }, [refreshRecentRequests, workbench]);

  useHeaderRefresh(handleRefresh, isCurrentLayer);

  const disableMutations =
    connectionStatus !== 'connected' ||
    workbench.mutating ||
    workbench.isFetching ||
    workbench.isError;

  const persistUiState = useCallback(
    (updater: (prev: ProvidersWorkbenchUiState) => ProvidersWorkbenchUiState) => {
      setUiState((prev) => {
        const next = updater(prev);
        writeProvidersWorkbenchUiState(next);
        return next;
      });
    },
    []
  );

  const setActiveBrand = useCallback(
    (brand: ProviderBrand) => {
      persistUiState((prev) =>
        prev.activeBrand === brand ? prev : { ...prev, activeBrand: brand }
      );
    },
    [persistUiState]
  );

  const allGroups = useMemo(() => workbench.snapshot?.groups ?? [], [workbench.snapshot]);
  const groups = useMemo(
    () =>
      fixedBrand
        ? allGroups.filter((group) => group.id === fixedBrand)
        : allGroups.filter((group) => group.id !== 'apikeyFun'),
    [allGroups, fixedBrand]
  );
  const activeGroup = groups[0] ?? null;

  const updateFilterState = useCallback(
    (brand: ProviderBrand, patch: Partial<ProviderFilterState>) => {
      persistUiState((prev) => {
        const current = getProviderFilterState(prev, brand);
        return {
          ...prev,
          filtersByBrand: {
            ...prev.filtersByBrand,
            [brand]: {
              ...current,
              ...patch,
            },
          },
        };
      });
    },
    [persistUiState]
  );

  const groupViews = useMemo<ProviderGroupView[]>(
    () =>
      groups.map((group) => {
        const filterState = getProviderFilterState(uiState, group.id);
        const availableModels = Array.from(
          group.resources.reduce((seen, resource) => {
            resource.models.forEach((name) => seen.add(name));
            return seen;
          }, new Set<string>())
        ).sort();
        const availableModelSet = new Set(availableModels);
        const selectedModels = new Set(
          filterState.selectedModels.filter((name) => availableModelSet.has(name))
        );
        const normalizedFilter = filterState.filter.trim().toLowerCase();
        let visibleResources = group.resources.filter((resource) =>
          matchesFilter(resource, normalizedFilter)
        );
        if (selectedModels.size > 0) {
          visibleResources = visibleResources.filter((resource) =>
            resource.models.some((name) => selectedModels.has(name))
          );
        }
        visibleResources = [...visibleResources].sort((left, right) => {
          const sortDiff =
            filterState.sortBy === 'name'
              ? getResourceSortName(left).localeCompare(getResourceSortName(right))
              : filterState.sortBy === 'priority'
                ? left.priority - right.priority
                : getResourceRecentSuccess(left, usageByProvider) -
                  getResourceRecentSuccess(right, usageByProvider);
          const diff = sortDiff || left.originalIndex - right.originalIndex;
          return filterState.sortDir === 'asc' ? diff : -diff;
        });
        return {
          group,
          filterState,
          availableModels,
          selectedModels,
          visibleResources,
        };
      }),
    [groups, uiState, usageByProvider]
  );

  const totalResources = useMemo(
    () => groups.reduce((sum, g) => sum + g.resources.length, 0),
    [groups]
  );

  const totalActive = useMemo(
    () => groups.reduce((sum, g) => sum + g.resources.filter((r) => !r.disabled).length, 0),
    [groups]
  );

  const providerFamilies = useMemo(
    () => groups.filter((g) => g.resources.length > 0).length,
    [groups]
  );
  const quickStartResource = useMemo(
    () =>
      fixedBrand === 'apikeyFun' && activeGroup ? (activeGroup.resources[0] ?? null) : null,
    [activeGroup, fixedBrand]
  );

  const updatedAtLabel = workbench.snapshot
    ? formatDateTime(workbench.snapshot.fetchedAt, i18n.language)
    : t('providersPage.modelCatalog.notLoaded');
  const headerTitle =
    fixedBrand === 'apikeyFun'
      ? quickStartResource
        ? APIKEY_FUN_DISPLAY_NAME
        : t('nav.quick_start')
      : undefined;
  const errorBanner = workbench.errorMessage ? (
    <div className="error-box">{workbench.errorMessage}</div>
  ) : null;
  const mainToolbar = !fixedBrand ? (
    <div className={legacyStyles.displayOptionsItem}>
      <Button size="sm" onClick={() => setProviderPickerOpen(true)} disabled={disableMutations}>
        <IconPlus size={15} />
        {t('ai_providers.add_provider')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => navigate('/ai-providers/ampcode')}
        disabled={disableMutations}
      >
        Amp CLI
      </Button>
      <DropdownMenu
        ariaLabel={t('ai_providers.display_options_label')}
        triggerLabel={t('ai_providers.display_options_label')}
        triggerIcon={<IconSlidersHorizontal size={15} />}
        triggerClassName={legacyStyles.displayOptionsTrigger}
        items={[
          {
            key: 'display-options',
            label: t('ai_providers.display_options_label'),
            content: (
              <div className={legacyStyles.displayOptionsMenu}>
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
  ) : null;

  const openCreate = useCallback(() => {
    setProviderPickerOpen(true);
  }, []);

  const openCreateForBrand = useCallback(
    (brand: ProviderBrand) => {
      setProviderPickerOpen(false);
      setActiveBrand(brand);
      setSheetState({ open: true, brand, mode: 'create', resource: null });
    },
    [setActiveBrand]
  );

  const openView = useCallback((resource: ProviderResource) => {
    setSheetState({
      open: true,
      brand: resource.brand,
      mode: 'detail',
      resource,
    });
  }, []);

  const openEdit = useCallback((resource: ProviderResource) => {
    setSheetState({
      open: true,
      brand: resource.brand,
      mode: 'edit',
      resource,
    });
  }, []);

  const closeSheet = useCallback(() => {
    setSheetState((s) => ({ ...s, open: false }));
  }, []);

  const handleDelete = useCallback(
    (resource: ProviderResource) => {
      const name = resource.name ?? resource.apiKeyPreview ?? resource.identifier ?? '';
      showConfirmation({
        title: t('providersPage.delete.title'),
        message: t('providersPage.delete.confirm', { name }),
        variant: 'danger',
        confirmText: t('providersPage.actions.delete'),
        onConfirm: async () => {
          try {
            await workbench.deleteProvider(resource);
            showNotification(t('providersPage.toast.deleted'), 'success');
          } catch (err) {
            if (isSponsorPartialMutationError(err)) {
              showNotification(t('providersPage.sponsor.partialMutationWarning'), 'warning');
              return;
            }
            const msg = err instanceof Error ? err.message : String(err);
            showNotification(`${t('notification.delete_failed')}: ${msg}`, 'error');
          }
        },
      });
    },
    [showConfirmation, showNotification, t, workbench]
  );

  const handleToggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      try {
        await workbench.toggleDisabled(resource, disabled);
        showNotification(
          disabled ? t('providersPage.toast.disabled') : t('providersPage.toast.enabled'),
          'success'
        );
      } catch (err) {
        if (isSponsorPartialMutationError(err)) {
          showNotification(t('providersPage.sponsor.partialMutationWarning'), 'warning');
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(`${t('providersPage.toast.toggleFailed')}: ${msg}`, 'error');
      }
    },
    [showNotification, t, workbench]
  );

  const handleCreated = useCallback(() => {
    showNotification(t('providersPage.toast.created'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  const handleUpdated = useCallback(() => {
    showNotification(t('providersPage.toast.updated'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  // 加载状态
  if (!workbench.snapshot && workbench.isPending) {
    return (
      <div className={styles.page}>
        <Skeleton height={120} />
        <div className={styles.layout}>
          <Skeleton height={420} />
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className={styles.page}>
        {mainToolbar}
        {errorBanner}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {fixedBrand ? (
        <ProviderHeaderCard
          title={headerTitle}
          totalActive={totalActive}
          totalResources={totalResources}
          providerFamilies={providerFamilies}
          updatedAtLabel={updatedAtLabel}
          isFetching={workbench.isFetching}
          isNewDisabled={disableMutations}
          showNewAction={false}
          showSummary={fixedBrand !== 'apikeyFun'}
          newLabel={t('providersPage.actions.new')}
          variant={fixedBrand === 'apikeyFun' ? 'quickStart' : undefined}
          onRefresh={() => void handleRefresh()}
          onNew={openCreate}
        />
      ) : (
        mainToolbar
      )}

      {errorBanner}

      <div className={`${styles.layout} ${fixedBrand ? styles.layoutSingle : ''}`.trim()}>
        {fixedBrand === 'apikeyFun' ? (
          <SponsorQuickStartPanel
            resource={quickStartResource}
            workbench={workbench}
            mutationDisabled={disableMutations}
          />
        ) : (
          groupViews.map((view) => {
            const toolbarControls: ProviderPanelControls = {
              sortBy: view.filterState.sortBy,
              sortDir: view.filterState.sortDir,
              onSortBy: (value: ProviderSortBy) =>
                updateFilterState(view.group.id, { sortBy: value }),
              onSortDir: (value: SortDir) =>
                updateFilterState(view.group.id, { sortDir: value }),
              availableModels: view.availableModels,
              selectedModels: view.selectedModels,
              onSelectedModelsChange: (next) =>
                updateFilterState(view.group.id, {
                  selectedModels: Array.from(next).sort((left, right) =>
                    left.localeCompare(right)
                  ),
                }),
            };
            return (
              <ProviderResourcePanel
                key={view.group.id}
                group={view.group}
                filter={view.filterState.filter}
                onFilterChange={(value) =>
                  updateFilterState(view.group.id, { filter: value })
                }
                filteredResources={view.visibleResources}
                selectedId={sheetState.open ? (sheetState.resource?.id ?? null) : null}
                viewMode={listMode ? 'list' : 'cards'}
                disableMutations={disableMutations}
                usageByProvider={usageByProvider}
                toolbarControls={toolbarControls}
                onView={openView}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleDisabled={handleToggleDisabled}
                onCreate={openCreate}
              />
            );
          })
        )}
      </div>

      {!fixedBrand ? (
        <ProviderSheet
          ref={sheetRef}
          state={sheetState}
          onClose={closeSheet}
          onSwitchToEdit={() => {
            setSheetState((s) => (s.resource ? { ...s, mode: 'edit' } : s));
          }}
          workbench={workbench}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
          mutationDisabled={disableMutations}
          usageByProvider={usageByProvider}
        />
      ) : null}

      {!fixedBrand ? (
        <Modal
          open={providerPickerOpen}
          title={t('ai_providers.add_provider_title')}
          onClose={() => setProviderPickerOpen(false)}
          width={720}
        >
          <div className={styles.providerPickerGrid}>
            {groups.map((group) => {
              const logo = PROVIDER_LOGOS[group.id];
              return (
                <button
                  key={group.id}
                  type="button"
                  className={styles.providerPickerButton}
                  onClick={() => openCreateForBrand(group.id)}
                  disabled={disableMutations}
                >
                  {logo ? (
                    <span className={styles.providerPickerLogoWrap}>
                      <img
                        src={logo.src}
                        alt=""
                        aria-hidden="true"
                        className={`${styles.providerPickerLogo} ${logo.darkSrc ? styles.providerPickerLogoLight : ''} ${logo.invertOnDark ? styles.providerPickerLogoInvert : ''}`.trim()}
                      />
                      {logo.darkSrc ? (
                        <img
                          src={logo.darkSrc}
                          alt=""
                          aria-hidden="true"
                          className={`${styles.providerPickerLogo} ${styles.providerPickerLogoDark}`}
                        />
                      ) : null}
                    </span>
                  ) : null}
                  <span className={styles.providerPickerText}>
                    <strong>{t(`providersPage.providerNames.${group.id}`)}</strong>
                    <small>
                      {t('providersPage.categories.activeCount', {
                        active: group.resources.filter((resource) => !resource.disabled).length,
                        total: group.resources.length,
                      })}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

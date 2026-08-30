import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPencil, IconSearch, IconTrash2, IconX } from '@/components/ui/icons';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import type { ModelPriceSyncCandidate, ModelPriceSyncResponse } from '@/services/api/usageService';
import { useNotificationStore } from '@/stores';
import { useUsageData } from '@/features/monitoring/hooks/useUsageData';
import {
  applyCandidatePrice,
  buildModelPriceRows,
  buildModelPriceSummary,
  buildSelectedSyncModels,
  buildPriceFromDraft,
  buildSyncPriceModelsFromUsage,
  createEmptyPriceDraft,
  createPriceDraft,
  filterModelPriceRows,
  formatPriceUnit,
  type ModelPriceFilter,
  type ModelPriceSyncStrategy,
  type PriceDraft,
} from '@/features/monitoring/model/modelPricesPageModel';
import {
  readModelPricesPageUiState,
  writeModelPricesPageUiState,
} from './modelPricesPageUiState';
import styles from './ModelPricesPage.module.scss';

const FILTERS: ModelPriceFilter[] = ['all', 'missing', 'candidates', 'saved'];

const resolveErrorMessage = (error: unknown, fallback: string) => {
  const rawMessage = error instanceof Error ? error.message : String(error || fallback);
  return rawMessage === 'model_price_sync_requires_usage_service'
    ? 'model_price_sync_requires_usage_service'
    : rawMessage;
};

export function ModelPricesPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const featureAvailability = usePanelFeatureAvailability();
  const {
    modelCallStats,
    loading,
    modelPrices,
    useResponseModelForBilling,
    setModelPrices,
    setUseResponseModelForBilling,
    syncModelPrices,
    usageServiceAvailable,
  } = useUsageData();
  const initialUiState = useRef(readModelPricesPageUiState());
  const [search, setSearch] = useState(() => initialUiState.current.search);
  const [filter, setFilter] = useState<ModelPriceFilter>(() => initialUiState.current.filter);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ModelPriceSyncResponse | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [selectedSyncModels, setSelectedSyncModels] = useState<Record<string, boolean>>({});
  const [syncStrategy, setSyncStrategy] =
    useState<ModelPriceSyncStrategy>('credential_matches');
  const [draft, setDraft] = useState<PriceDraft>(() => createEmptyPriceDraft());
  const [manualEditorOpen, setManualEditorOpen] = useState(false);

  const syncModels = useMemo(
    () => buildSyncPriceModelsFromUsage(modelCallStats, modelPrices),
    [modelCallStats, modelPrices]
  );

  const candidateSets = useMemo(() => syncResult?.candidates ?? [], [syncResult?.candidates]);
  const rows = useMemo(
    () => buildModelPriceRows(modelCallStats, modelPrices, candidateSets),
    [candidateSets, modelCallStats, modelPrices]
  );
  const summary = useMemo(() => buildModelPriceSummary(rows), [rows]);
  const visibleRows = useMemo(
    () => filterModelPriceRows(rows, filter, search),
    [filter, rows, search]
  );
  const selectedScopeModels = useMemo(
    () => buildSelectedSyncModels(syncModels, selectedSyncModels),
    [selectedSyncModels, syncModels]
  );
  const explicitSelectionCount = useMemo(
    () => syncModels.filter((model) => selectedSyncModels[model]).length,
    [selectedSyncModels, syncModels]
  );

  const filterCounts = useMemo<Record<ModelPriceFilter, number>>(
    () => ({
      all: summary.total,
      missing: summary.missing,
      candidates: summary.candidates,
      saved: summary.saved,
    }),
    [summary]
  );

  useEffect(() => {
    writeModelPricesPageUiState({ search, filter });
  }, [filter, search]);

  useEffect(() => {
    setSelectedSyncModels((previous) => {
      const next: Record<string, boolean> = {};
      syncModels.forEach((model) => {
        if (previous[model]) next[model] = true;
      });
      return next;
    });
  }, [syncModels]);

  const handleSync = async () => {
    if (syncStrategy === 'selected' && selectedScopeModels.length === 0) {
      showNotification(t('usage_stats.model_price_sync_no_models'), 'warning');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncModelPrices(
        syncStrategy === 'credential_matches' || syncStrategy === 'credentials'
          ? { strategy: syncStrategy }
          : { strategy: 'selected', models: selectedScopeModels }
      );
      setSyncResult(result);
      showNotification(
        t('model_prices.sync_success_detail', {
          imported: result.imported,
          candidates: result.candidates?.length ?? 0,
          unmatched: result.unmatched?.length ?? 0,
        }),
        'success'
      );
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, t('common.unknown_error'));
      showNotification(
        `${t('usage_stats.model_price_sync_failed')}: ${
          message === 'model_price_sync_requires_usage_service'
            ? t('usage_stats.model_price_sync_requires_usage_service')
            : message
        }`,
        'error'
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmCandidate = async (model: string, candidate: ModelPriceSyncCandidate) => {
    await setModelPrices(applyCandidatePrice(modelPrices, model, candidate));
    setSyncResult((previous) =>
      previous
        ? {
            ...previous,
            candidates: previous.candidates?.filter((set) => set.model !== model),
            unmatched: previous.unmatched?.filter((item) => item !== model),
          }
        : previous
    );
    showNotification(t('model_prices.candidate_confirmed'), 'success');
  };

  const handleSaveDraft = async () => {
    const price = buildPriceFromDraft(draft);
    const model = draft.model.trim();
    if (!model || !price) {
      showNotification(t('usage_stats.model_price_model_required'), 'warning');
      return;
    }
    await setModelPrices({
      ...modelPrices,
      [model]: {
        ...price,
      },
    });
    setDraft(createEmptyPriceDraft());
    setManualEditorOpen(false);
    showNotification(t('usage_stats.model_price_saved'), 'success');
  };

  const handleDelete = async (model: string) => {
    const next = { ...modelPrices };
    delete next[model];
    await setModelPrices(next);
    if (draft.model === model) {
      setDraft(createEmptyPriceDraft());
      setManualEditorOpen(false);
    }
  };

  const setDraftField = (field: keyof PriceDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const openManualEditor = (model = '', price = modelPrices[model]) => {
    setDraft(createPriceDraft(model, price));
    setManualEditorOpen(true);
  };

  const closeManualEditor = () => {
    setDraft(createEmptyPriceDraft());
    setManualEditorOpen(false);
  };

  const toggleSyncModel = (model: string) => {
    setSelectedSyncModels((previous) => ({
      ...previous,
      [model]: !previous[model],
    }));
  };

  const toggleAllVisibleSyncModels = () => {
    const visibleModels = visibleRows.map((row) => row.model).filter((model) => syncModels.includes(model));
    const allSelected = visibleModels.length > 0 && visibleModels.every((model) => selectedSyncModels[model]);
    setSelectedSyncModels((previous) => {
      const next = { ...previous };
      visibleModels.forEach((model) => {
        if (allSelected) {
          delete next[model];
        } else {
          next[model] = true;
        }
      });
      return next;
    });
  };

  return (
    <div className={styles.page}>
      <section className={styles.actionBar} aria-label={t('common.action')}>
        <div className={styles.titleGroup}>
          {featureAvailability.requestMonitoringAvailable ? (
            <Link to="/monitoring" className={styles.backLink}>
              {t('model_prices.back_to_monitoring')}
            </Link>
          ) : null}
        </div>
        <div className={styles.actionGroup}>
          <span className={styles.metaPill}>
            {usageServiceAvailable
              ? t('model_prices.usage_service_ready')
              : t('model_prices.usage_service_required')}
          </span>
          <span className={styles.metaPill}>
            {syncStrategy === 'credential_matches'
              ? t('model_prices.sync_matched_scope')
              : syncStrategy === 'credentials'
                ? t('model_prices.sync_credentials_scope')
                : t('model_prices.sync_model_count', {
                    count: explicitSelectionCount || selectedScopeModels.length,
                  })}
          </span>
          <select
            className={styles.strategySelect}
            value={syncStrategy}
            onChange={(event) => setSyncStrategy(event.target.value as ModelPriceSyncStrategy)}
            aria-label={t('model_prices.sync_strategy')}
          >
            <option value="credential_matches">
              {t('model_prices.sync_strategy_credential_matches')}
            </option>
            <option value="selected">{t('model_prices.sync_strategy_selected')}</option>
            <option value="credentials">{t('model_prices.sync_strategy_credentials')}</option>
          </select>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => openManualEditor()}
            className={styles.toolbarButton}
          >
            {t('model_prices.add_manual')}
          </Button>
          <Button size="xs" onClick={() => void handleSync()} loading={syncing}>
            {t('usage_stats.model_price_sync')}
          </Button>
        </div>
      </section>

      <section className={styles.pricePanel}>
        <div className={styles.panelToolbar}>
          <div className={styles.searchWrap}>
            <Input
              className={styles.compactInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('model_prices.search_placeholder')}
              rightElement={<IconSearch size={15} />}
            />
          </div>
          <div className={styles.filterGroup}>
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.filterButton} ${
                  filter === item ? styles.filterButtonActive : ''
                }`}
                onClick={() => setFilter(item)}
              >
                <span>{t(`model_prices.filter_${item}`)}</span>
                <strong>{filterCounts[item]}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pricingPolicyNote}>{t('model_prices.gpt56_policy_note')}</div>

        <ToggleSwitch
          checked={useResponseModelForBilling}
          onChange={(enabled) => void setUseResponseModelForBilling(enabled)}
          label={t('model_prices.response_model_billing')}
          ariaLabel={t('model_prices.response_model_billing')}
        />
        <div className={styles.pricingPolicyNote}>
          {t('model_prices.response_model_billing_hint')}
        </div>

        {syncResult?.sourceResults?.length ? (
          <div className={styles.sourceResults}>
            {syncResult.sourceResults.map((result) => (
              <span
                key={result.source}
                className={result.error ? styles.sourceResultError : undefined}
                title={result.error || undefined}
              >
                <strong>{result.source}</strong>
                {result.error
                  ? t('model_prices.source_result_failed')
                  : t('model_prices.source_result_ok', {
                      models: result.models,
                      skipped: result.skipped,
                    })}
              </span>
            ))}
          </div>
        ) : null}

        {manualEditorOpen ? (
          <div className={styles.compactEditor}>
            <Input
              label={t('usage_stats.model_name')}
              className={styles.compactInput}
              value={draft.model}
              onChange={(event) => setDraftField('model', event.target.value)}
              placeholder="gpt-5.5"
            />
            <Input
              label={`${t('usage_stats.model_price_prompt')} ($/1M)`}
              className={styles.compactInput}
              type="number"
              value={draft.prompt}
              onChange={(event) => setDraftField('prompt', event.target.value)}
              placeholder="0.0000"
              step="0.0001"
            />
            <Input
              label={`${t('usage_stats.model_price_completion')} ($/1M)`}
              className={styles.compactInput}
              type="number"
              value={draft.completion}
              onChange={(event) => setDraftField('completion', event.target.value)}
              placeholder="0.0000"
              step="0.0001"
            />
            <Input
              label={`${t('usage_stats.model_price_cache_read')} ($/1M)`}
              className={styles.compactInput}
              type="number"
              value={draft.cacheRead}
              onChange={(event) => setDraftField('cacheRead', event.target.value)}
              placeholder="0.0000"
              step="0.0001"
            />
            <Input
              label={`${t('usage_stats.model_price_cache_creation')} ($/1M)`}
              className={styles.compactInput}
              type="number"
              value={draft.cacheCreation}
              onChange={(event) => setDraftField('cacheCreation', event.target.value)}
              placeholder="0.0000"
              step="0.0001"
            />
            <div className={styles.compactEditorActions}>
              <Button
                size="xs"
                variant="ghost"
                iconOnly
                aria-label={t('common.cancel')}
                onClick={closeManualEditor}
              >
                <IconX size={14} />
              </Button>
              <Button size="xs" onClick={() => void handleSaveDraft()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.emptyState}>{t('common.loading')}</div>
        ) : visibleRows.length === 0 ? (
          <div className={styles.emptyState}>{t('model_prices.empty')}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.priceTable}>
              <thead>
                <tr>
                  <th className={styles.selectHeader}>
                    <input
                      type="checkbox"
                      checked={
                        visibleRows.length > 0 &&
                        visibleRows
                          .map((row) => row.model)
                          .filter((model) => syncModels.includes(model))
                          .every((model) => selectedSyncModels[model])
                      }
                      onChange={toggleAllVisibleSyncModels}
                      aria-label={t('model_prices.select_visible')}
                    />
                  </th>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('model_prices.calls')}</th>
                  <th>{t('usage_stats.model_price_prompt')}</th>
                  <th>{t('usage_stats.model_price_completion')}</th>
                  <th>{t('usage_stats.model_price_cache_read')}</th>
                  <th>{t('usage_stats.model_price_cache_creation')}</th>
                  <th>{t('model_prices.source')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const candidates =
                    candidateSets.find((candidateSet) => candidateSet.model === row.model)
                      ?.candidates ?? [];
                  const selectedSource =
                    selectedCandidates[row.model] || candidates[0]?.sourceModelId || '';
                  const selectedCandidate =
                    candidates.find((candidate) => candidate.sourceModelId === selectedSource) ??
                    candidates[0];

                  return (
                    <tr key={row.model}>
                      <td className={styles.selectCell}>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedSyncModels[row.model])}
                          disabled={!syncModels.includes(row.model)}
                          onChange={() => toggleSyncModel(row.model)}
                          aria-label={t('model_prices.select_model', { model: row.model })}
                        />
                      </td>
                      <td className={styles.modelCell}>
                        <div className={styles.modelContent}>
                          <strong>{row.model}</strong>
                          {!row.hasPrice && candidates.length > 0 ? (
                            <span>{t('model_prices.needs_confirmation')}</span>
                          ) : !row.hasPrice ? (
                            <span>{t('model_prices.no_price')}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{row.calls}</td>
                      <td>{formatPriceUnit(row.price?.prompt)}</td>
                      <td>{formatPriceUnit(row.price?.completion)}</td>
                      <td>{formatPriceUnit(row.price?.cacheRead ?? row.price?.cache)}</td>
                      <td>{formatPriceUnit(row.price?.cacheCreation ?? row.price?.prompt)}</td>
                      <td className={styles.sourceCell}>
                        {row.price ? (
                          <div className={styles.sourceContent}>
                            <span className={styles.sourceBadge}>
                              {row.price.source || 'manual'}
                            </span>
                            {row.price.sourceModelId ? (
                              <small>{row.price.sourceModelId}</small>
                            ) : null}
                          </div>
                        ) : selectedCandidate ? (
                          <div className={styles.sourceContent}>
                            <span className={styles.sourceBadge}>
                              {selectedCandidate.price.source || 'sync'}
                            </span>
                            <small>{selectedCandidate.sourceModelId}</small>
                          </div>
                        ) : (
                          <span className={styles.sourcePlaceholder}>--</span>
                        )}
                      </td>
                      <td
                        className={`${styles.actionsCell} ${
                          !row.hasPrice && candidates.length > 0 ? styles.candidateActionsCell : ''
                        }`}
                      >
                        <div className={styles.rowActions}>
                          {row.hasPrice ? (
                            <>
                              <button
                                type="button"
                                className={styles.iconAction}
                                title={t('common.edit')}
                                aria-label={t('common.edit')}
                                onClick={() => openManualEditor(row.model, row.price)}
                              >
                                <IconPencil size={14} />
                              </button>
                              <button
                                type="button"
                                className={styles.iconAction}
                                title={t('common.delete')}
                                aria-label={t('common.delete')}
                                onClick={() => void handleDelete(row.model)}
                              >
                                <IconTrash2 size={14} />
                              </button>
                            </>
                          ) : candidates.length > 0 && selectedCandidate ? (
                            <div className={styles.candidateControl}>
                              <select
                                value={selectedSource}
                                onChange={(event) =>
                                  setSelectedCandidates((previous) => ({
                                    ...previous,
                                    [row.model]: event.target.value,
                                  }))
                                }
                                aria-label={t('model_prices.candidate_select')}
                              >
                                {candidates.map((candidate) => (
                                  <option
                                    key={candidate.sourceModelId}
                                    value={candidate.sourceModelId}
                                  >
                                    {`${candidate.price.source || 'sync'} · ${candidate.sourceModelId} · ${Math.round(candidate.score * 100)}%`}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className={styles.confirmButton}
                                onClick={() =>
                                  void handleConfirmCandidate(row.model, selectedCandidate)
                                }
                              >
                                <span>{t('model_prices.confirm_candidate')}</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={styles.confirmButton}
                              onClick={() => openManualEditor(row.model)}
                            >
                              <span>{t('model_prices.add_manual')}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </section>
    </div>
  );
}

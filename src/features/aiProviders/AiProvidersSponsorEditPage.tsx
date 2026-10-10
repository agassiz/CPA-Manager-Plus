import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconAlertTriangle, IconCheckCircle2, IconPlus, IconX } from '@/components/ui/icons';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useAuthStore, useNotificationStore } from '@/stores';
import { parseProviderIndexParam } from '@/features/aiProviders/model/routeParams';
import {
  applyDiscoveredModels,
  emptyModel,
  emptySponsorForm,
  emptySponsorKeyEntry,
  formatUsageAmount,
  getSponsorRaw,
  isHealthyUsageSummary,
  protocolUrlForEntry,
  sponsorKeyEntriesFromRaw,
} from '@/features/providers/sponsorForm';
import {
  discoveryBrandForSponsorProtocol,
  getSponsorAggregationConflict,
  getSponsorProviderDefinition,
  sponsorProtocolI18nKey,
  sponsorProtocolModelI18nKey,
  type SponsorProviderDefinition,
} from '@/features/providers/sponsorDefinitions';
import { isSponsorPartialMutationError } from '@/features/providers/sponsorMutationRecovery';
import { useModelDiscovery } from '@/features/providers/shared/useModelDiscovery';
import {
  useSponsorUsageCheck,
  type SponsorUsageMessages,
} from '@/features/providers/shared/useSponsorUsageCheck';
import type {
  ModelEntryInput,
  ProviderEntryFormInput,
  SponsorKeyEntryInput,
  SponsorProtocol,
  SponsorProviderBrand,
} from '@/features/providers/types';
import { useProviderWorkbench } from '@/features/providers/useProviderWorkbench';
import { maskApiKey } from '@/utils/format';
import layoutStyles from './AiProvidersEditLayout.module.scss';
import pageStyles from './AiProvidersPage.module.scss';
import styles from './AiProvidersSponsorEditPage.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

interface SponsorEditPageProps {
  brand: SponsorProviderBrand;
}

// ModelInputList edits name and alias only; keep the other per-model fields of the
// entries that survive the edit (matched by upstream model name).
const mergeModelEdits = (
  previous: ModelEntryInput[],
  edited: Array<{ name: string; alias: string }>
): ModelEntryInput[] => {
  const byName = new Map(previous.map((model) => [model.name.trim(), model]));
  return edited.map((entry) => ({ ...(byName.get(entry.name.trim()) ?? {}), ...entry }));
};

interface SponsorEntrySectionProps {
  entry: SponsorKeyEntryInput;
  index: number;
  mode: 'create' | 'edit';
  definition: SponsorProviderDefinition;
  usedProtocols: Set<SponsorProtocol>;
  canRemove: boolean;
  disabled: boolean;
  onChange: (entry: SponsorKeyEntryInput) => void;
  onRemove: () => void;
}

function SponsorEntrySection({
  entry,
  index,
  mode,
  definition,
  usedProtocols,
  canRemove,
  disabled,
  onChange,
  onRemove,
}: SponsorEntrySectionProps) {
  const { t, i18n } = useTranslation();
  const endpointUrl = protocolUrlForEntry(entry, definition);
  const protocolLabel = t(
    `providersPage.sponsor.protocols.${sponsorProtocolI18nKey(entry.protocol)}`
  );
  const summaryKey = entry.apiKey.trim() || entry.existingApiKey?.trim() || '';
  const modelKey = sponsorProtocolModelI18nKey(entry.protocol);

  const usageMessages = useMemo<SponsorUsageMessages>(
    () => ({
      apiKeyRequired: t('providersPage.sponsor.usageApiKeyRequired'),
      emptyResponse: t('providersPage.sponsor.usageEmpty'),
      requestFailed: t('providersPage.connectivity.requestFailed'),
    }),
    [t]
  );
  const usageCheck = useSponsorUsageCheck(
    { baseUrl: entry.baseUrl, apiKey: entry.apiKey, fallbackApiKey: entry.existingApiKey },
    usageMessages
  );
  const usageSummary = usageCheck.status.summary;
  const usageHealthy = usageSummary ? isHealthyUsageSummary(usageSummary) : true;

  const discoveryHeaders = useMemo<Array<{ key: string; value: string }>>(() => [], []);
  const openaiDiscoveryEntries = useMemo(
    () => [
      {
        apiKey: entry.apiKey,
        existingApiKey: entry.existingApiKey,
        proxyUrl: entry.proxyUrl,
      },
    ],
    [entry.apiKey, entry.existingApiKey, entry.proxyUrl]
  );
  const discovery = useModelDiscovery({
    brand: discoveryBrandForSponsorProtocol(entry.protocol),
    baseUrl: endpointUrl,
    formHeaders: discoveryHeaders,
    apiKey: entry.apiKey,
    fallbackApiKey: entry.existingApiKey,
    apiKeyEntries: entry.protocol === 'openai' ? openaiDiscoveryEntries : undefined,
  });
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [discoverySelected, setDiscoverySelected] = useState<Set<string>>(new Set());

  const models = useMemo(
    () => (entry.models.length ? entry.models : [emptyModel()]),
    [entry.models]
  );
  const existingModelNames = useMemo(
    () => new Set(models.map((model) => model.name.trim()).filter(Boolean)),
    [models]
  );
  const visibleDiscovered = useMemo(() => {
    const filter = discoverySearch.trim().toLowerCase();
    return discovery.models.filter(
      (model) =>
        !existingModelNames.has(model.name.trim()) &&
        (!filter ||
          model.name.toLowerCase().includes(filter) ||
          (model.alias ?? '').toLowerCase().includes(filter))
    );
  }, [discovery.models, discoverySearch, existingModelNames]);

  const protocolOptions = definition.protocols
    .filter((protocol) => protocol === entry.protocol || !usedProtocols.has(protocol))
    .map((protocol) => ({
      value: protocol,
      label: t(`providersPage.sponsor.protocols.${sponsorProtocolI18nKey(protocol)}`),
    }));

  const update = (patch: Partial<SponsorKeyEntryInput>) => onChange({ ...entry, ...patch });

  const openDiscovery = () => {
    setDiscoverySearch('');
    setDiscoverySelected(new Set());
    setDiscoveryOpen(true);
    if (!discovery.loading && !discovery.hasFetched) void discovery.fetch();
  };

  const applyDiscovery = () => {
    const picked = discovery.models.filter((model) => discoverySelected.has(model.name));
    update({ models: applyDiscoveredModels(models, picked) });
    setDiscoveryOpen(false);
  };

  const toggleDiscovered = (name: string) =>
    setDiscoverySelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className={styles.entryCard}>
      <div className={styles.entryHeader}>
        <div className={styles.entryTitle}>
          <span>{t('providersPage.sponsor.groupedKey', { index: index + 1 })}</span>
          <strong>{protocolLabel}</strong>
          <span className={styles.entrySummary}>
            {summaryKey ? maskApiKey(summaryKey) : t('providersPage.status.notConfigured')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label={t('providersPage.sponsor.removeGroupedKey')}
          title={t('providersPage.sponsor.removeGroupedKey')}
        >
          <IconX size={14} />
        </Button>
      </div>

      <div className="form-group">
        <label>{t('providersPage.sponsor.protocol')}</label>
        <Select
          value={entry.protocol}
          options={protocolOptions}
          onChange={(value) => update({ protocol: value as SponsorProtocol, models: [emptyModel()] })}
          disabled={disabled}
          ariaLabel={t('providersPage.sponsor.protocol')}
        />
        <div className="hint">{t('providersPage.sponsor.protocolHint')}</div>
      </div>

      {definition.baseUrlOptions.length > 1 ? (
        <div className="form-group">
          <label>{t('providersPage.sponsor.urlMode', { provider: definition.displayName })}</label>
          <div className={styles.urlOptions} role="radiogroup">
            {definition.baseUrlOptions.map((option) => {
              const checked = definition.resolveBaseUrl(entry.baseUrl) === option.baseUrl;
              return (
                <label
                  key={option.id}
                  className={`${styles.urlOption} ${checked ? styles.urlOptionActive : ''}`}
                >
                  <input
                    type="radio"
                    name={`sponsor-${index}-base-url`}
                    value={option.baseUrl}
                    checked={checked}
                    onChange={() => update({ baseUrl: option.baseUrl })}
                    disabled={disabled}
                  />
                  <span>
                    <span>{t(`providersPage.sponsor.urlOptions.${option.id}`)}</span>
                    <small>{option.baseUrl}</small>
                    {option.descriptionKey ? (
                      <small>
                        {t(`providersPage.sponsor.urlOptionDescriptions.${option.descriptionKey}`)}
                      </small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="hint">{t('providersPage.sponsor.urlHint')}</div>
        </div>
      ) : null}

      <div className={styles.endpointRow}>
        <span>{t('providersPage.sponsor.protocolEndpoint')}</span>
        <code>{endpointUrl}</code>
      </div>

      <Input
        label={t('providersPage.form.apiKey')}
        type="password"
        revealable
        revealLabel={t('providersPage.form.showApiKey')}
        hideLabel={t('providersPage.form.hideApiKey')}
        autoComplete="new-password"
        value={entry.apiKey || entry.existingApiKey || ''}
        placeholder={
          mode === 'edit'
            ? t('providersPage.form.apiKeyEditPlaceholder')
            : t('providersPage.form.apiKeyCreatePlaceholder')
        }
        hint={t('providersPage.sponsor.apiKeyHint')}
        onChange={(e) => update({ apiKey: e.target.value })}
        disabled={disabled}
      />

      {definition.supportsUsageCheck ? (
        <div className={styles.usageRow}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void usageCheck.run()}
            loading={usageCheck.isLoading}
            disabled={disabled || usageCheck.isLoading}
          >
            {usageCheck.isLoading
              ? t('providersPage.sponsor.usageChecking')
              : t('providersPage.sponsor.usageCheck')}
          </Button>
          {usageCheck.status.state === 'success' && usageSummary ? (
            <span
              className={`${styles.usageResult} ${usageHealthy ? '' : styles.usageResultWarning}`}
            >
              {usageHealthy ? <IconCheckCircle2 size={14} /> : <IconAlertTriangle size={14} />}
              {t('providersPage.sponsor.usageRemaining', {
                amount: formatUsageAmount(usageSummary.remaining, i18n.language),
                unit: usageSummary.unit,
              })}
              {usageSummary.used !== null || usageSummary.limit !== null ? (
                <span className={styles.usageMeta}>
                  {t('providersPage.sponsor.usageBreakdown', {
                    used: formatUsageAmount(usageSummary.used, i18n.language),
                    limit: formatUsageAmount(usageSummary.limit, i18n.language),
                  })}
                </span>
              ) : null}
              {!usageHealthy ? (
                <span className={styles.usageMeta}>
                  {t('providersPage.sponsor.usageStatus', {
                    status: usageSummary.status || t('providersPage.sponsor.usageInvalid'),
                  })}
                </span>
              ) : null}
            </span>
          ) : null}
          {usageCheck.status.state === 'error' ? (
            <div className="error-box">{usageCheck.status.message}</div>
          ) : null}
        </div>
      ) : null}

      <Input
        label={t('providersPage.form.proxyUrl')}
        placeholder="http://127.0.0.1:7890"
        value={entry.proxyUrl}
        onChange={(e) => update({ proxyUrl: e.target.value })}
        disabled={disabled}
      />

      <div className={pageStyles.providerInlineFields}>
        <Input
          label={t('providersPage.form.prefix')}
          value={entry.prefix}
          onChange={(e) => update({ prefix: e.target.value })}
          disabled={disabled}
        />
        <Input
          label={t('providersPage.form.priority')}
          type="number"
          step={1}
          value={entry.priority ?? ''}
          onChange={(e) =>
            update({ priority: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label>{t('providersPage.form.disabled')}</label>
        <ToggleSwitch
          checked={entry.disabled}
          onChange={(value) => update({ disabled: value })}
          disabled={disabled}
          ariaLabel={t('providersPage.form.disabled')}
        />
        <div className="hint">{t('providersPage.form.disabledHint')}</div>
      </div>

      <div className="form-group">
        <label>{t('providersPage.form.disableCooling')}</label>
        <ToggleSwitch
          checked={entry.disableCooling ?? false}
          onChange={(value) => update({ disableCooling: value })}
          disabled={disabled}
          ariaLabel={t('providersPage.form.disableCooling')}
        />
        <div className="hint">{t('providersPage.form.disableCoolingHint')}</div>
      </div>

      <div className={pageStyles.modelConfigSection}>
        <div className={pageStyles.modelConfigHeader}>
          <label className={pageStyles.modelConfigTitle}>
            {t(`providersPage.sponsor.protocolModels.${modelKey}`)}
          </label>
          <div className={pageStyles.modelConfigToolbar}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => update({ models: [...models, emptyModel()] })}
              disabled={disabled}
            >
              <IconPlus size={14} />
              {t('providersPage.form.addModel')}
            </Button>
            <Button variant="secondary" size="sm" onClick={openDiscovery} disabled={disabled}>
              {t('providersPage.discovery.openButton')}
            </Button>
          </div>
        </div>
        <div className={pageStyles.sectionHint}>
          {t(`providersPage.sponsor.protocolModelHints.${modelKey}`)}
        </div>
        <ModelInputList
          entries={models.map((model) => ({ name: model.name, alias: model.alias ?? '' }))}
          onChange={(edited) => update({ models: mergeModelEdits(models, edited) })}
          hideAddButton
          disabled={disabled}
          removeButtonTitle={t('common.delete')}
          removeButtonAriaLabel={t('common.delete')}
        />
      </div>

      <Modal
        open={discoveryOpen}
        title={t('providersPage.discovery.openButton')}
        onClose={() => setDiscoveryOpen(false)}
        width={720}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDiscoveryOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={applyDiscovery} disabled={discoverySelected.size === 0}>
              {t('providersPage.discovery.apply', { count: discoverySelected.size })}
            </Button>
          </>
        }
      >
        <div className={pageStyles.openaiModelsContent}>
          <div className={pageStyles.openaiModelsEndpointControls}>
            <input
              className={`input ${pageStyles.openaiModelsEndpointInput}`}
              readOnly
              value={endpointUrl}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void discovery.fetch()}
              loading={discovery.loading}
            >
              {t('providersPage.discovery.reload')}
            </Button>
          </div>
          <Input
            label={t('providersPage.discovery.searchPlaceholder')}
            value={discoverySearch}
            onChange={(e) => setDiscoverySearch(e.target.value)}
            disabled={discovery.loading}
          />
          {discovery.error ? <div className="error-box">{discovery.error}</div> : null}
          {discovery.loading ? (
            <div className={pageStyles.sectionHint}>{t('providersPage.discovery.loading')}</div>
          ) : visibleDiscovered.length === 0 ? (
            <div className={pageStyles.sectionHint}>{t('providersPage.discovery.empty')}</div>
          ) : (
            <div className={pageStyles.modelDiscoveryList}>
              {visibleDiscovered.map((model) => {
                const checked = discoverySelected.has(model.name);
                return (
                  <SelectionCheckbox
                    key={model.name}
                    checked={checked}
                    onChange={() => toggleDiscovered(model.name)}
                    ariaLabel={model.name}
                    className={`${pageStyles.modelDiscoveryRow} ${
                      checked ? pageStyles.modelDiscoveryRowSelected : ''
                    }`}
                    labelClassName={pageStyles.modelDiscoverySelectionLabel}
                    label={<div className={pageStyles.modelDiscoveryName}>{model.name}</div>}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export function AiProvidersSponsorEditPage({ brand }: SponsorEditPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const workbench = useProviderWorkbench();

  const definition = useMemo(() => getSponsorProviderDefinition(brand), [brand]);
  const editIndex = useMemo(() => parseProviderIndexParam(params.index), [params.index]);
  const hasIndexParam = typeof params.index === 'string';
  const mode: 'create' | 'edit' = hasIndexParam ? 'edit' : 'create';

  const resources = useMemo(
    () => workbench.snapshot?.groups.find((group) => group.id === brand)?.resources ?? [],
    [brand, workbench.snapshot]
  );
  const resource = editIndex !== null ? (resources[editIndex] ?? null) : null;
  const loading = workbench.isPending;
  const invalid = hasIndexParam && !loading && !resource;

  const [form, setForm] = useState<ProviderEntryFormInput>(() => emptySponsorForm(definition));
  const [baselineSignature, setBaselineSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    const next: ProviderEntryFormInput = {
      ...emptySponsorForm(definition),
      sponsorKeyEntries:
        mode === 'edit'
          ? sponsorKeyEntriesFromRaw(getSponsorRaw(resource, brand), definition)
          : [emptySponsorKeyEntry(definition)],
    };
    setForm(next);
    setBaselineSignature(JSON.stringify(next));
  }, [brand, definition, loading, mode, resource]);

  const entries = useMemo(
    () => form.sponsorKeyEntries ?? [emptySponsorKeyEntry(definition)],
    [definition, form.sponsorKeyEntries]
  );
  const usedProtocols = useMemo(() => new Set(entries.map((entry) => entry.protocol)), [entries]);
  const missingProtocols = useMemo(
    () => definition.protocols.filter((protocol) => !usedProtocols.has(protocol)),
    [definition.protocols, usedProtocols]
  );
  const isDirty = useMemo(
    () => JSON.stringify({ ...form, sponsorKeyEntries: entries }) !== baselineSignature,
    [baselineSignature, entries, form]
  );
  const aggregationConflict =
    mode === 'edit' ? getSponsorAggregationConflict(getSponsorRaw(resource, brand)) : null;

  const disableControls = connectionStatus !== 'connected';
  const canSave = !disableControls && !saving && !loading && !invalid && !aggregationConflict;

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: !loading && !saving && !invalid,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const updateEntries = (next: SponsorKeyEntryInput[]) =>
    setForm((prev) => ({ ...prev, sponsorKeyEntries: next }));

  const validateEntries = (): string | null => {
    if (!entries.length) {
      return mode === 'edit' ? null : t('providersPage.sponsor.validation.keyRequired');
    }
    if (entries.some((entry) => !entry.apiKey.trim() && !entry.existingApiKey?.trim())) {
      return t('providersPage.sponsor.validation.keyRequired');
    }
    if (new Set(entries.map((entry) => entry.protocol)).size !== entries.length) {
      return t('providersPage.sponsor.validation.protocolDuplicate');
    }
    return null;
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const validationError = validateEntries();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const input = { ...form, sponsorKeyEntries: entries };
      if (mode === 'create') {
        await workbench.createProvider(brand, input);
      } else if (resource) {
        await workbench.updateProvider(resource, input);
      }
      showNotification(
        mode === 'create' ? t('providersPage.toast.created') : t('providersPage.toast.updated'),
        'success'
      );
      allowNextNavigation();
      setBaselineSignature(JSON.stringify(input));
      handleBack();
    } catch (err: unknown) {
      const message = isSponsorPartialMutationError(err)
        ? t('providersPage.sponsor.partialMutationWarning')
        : err instanceof Error
          ? err.message
          : String(err);
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
    // validateEntries only reads state already listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allowNextNavigation,
    brand,
    canSave,
    entries,
    form,
    handleBack,
    mode,
    resource,
    showNotification,
    t,
    workbench,
  ]);

  const title = `${t(
    mode === 'create' ? 'providersPage.form.createEyebrow' : 'providersPage.form.editEyebrow'
  )} · ${t(`providersPage.providerNames.${brand}`)}`;

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      hideTopBar
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      floatingAction={
        <div className={layoutStyles.floatingActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.floatingBackButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.floatingSaveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {error && <div className="error-box">{error}</div>}
        {invalid ? (
          <div className="hint">{t('common.invalid_provider_index')}</div>
        ) : aggregationConflict ? (
          <div className="error-box">{t('providersPage.sponsor.aggregationConflict')}</div>
        ) : (
          <>
            {entries.map((entry, index) => (
              <SponsorEntrySection
                key={`${entry.protocol}-${index}`}
                entry={entry}
                index={index}
                mode={mode}
                definition={definition}
                usedProtocols={usedProtocols}
                canRemove={mode === 'edit' || entries.length > 1}
                disabled={disableControls || saving}
                onChange={(next) =>
                  updateEntries(entries.map((item, itemIndex) => (itemIndex === index ? next : item)))
                }
                onRemove={() => {
                  const next = entries.filter((_, itemIndex) => itemIndex !== index);
                  updateEntries(
                    next.length || mode === 'edit' ? next : [emptySponsorKeyEntry(definition)]
                  );
                }}
              />
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const protocol = missingProtocols[0];
                if (protocol) updateEntries([...entries, emptySponsorKeyEntry(definition, protocol)]);
              }}
              disabled={disableControls || saving || missingProtocols.length === 0}
            >
              <IconPlus size={14} />
              {t('providersPage.sponsor.addGroupedKey')}
            </Button>
          </>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}

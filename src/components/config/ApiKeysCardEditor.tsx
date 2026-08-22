import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  usageServiceApi,
  type ApiKeyAlias,
} from '@/services/api/usageService';
import {
  apiKeyAccessApi,
  type ApiKeyAccessCredential,
  type ApiKeyAccessProvider,
  type ApiKeyAccessRule,
} from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { copyToClipboard } from '@/utils/clipboard';
import { maskApiKey } from '@/utils/format';
import { sha256Hex } from '@/utils/apiKeyHash';
import { isValidApiKeyCharset } from '@/utils/validation';
import { makeClientId } from '@/types/visualConfig';
import styles from './VisualConfigEditor.module.scss';

type OrphanAliasConflict = {
  apiKeyHash: string;
  alias: string;
};

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  accessRules,
  disabled,
  onChange,
  onAccessRulesSaved,
}: {
  value: string;
  accessRules: ApiKeyAccessRule[];
  disabled?: boolean;
  onChange: (nextValue: string) => void;
  onAccessRulesSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const managementKey = useAuthStore((state) => state.managementKey);
  const featureAvailability = usePanelFeatureAvailability();
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (apiKeyIds.length === apiKeys.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeys.length) return apiKeyIds.slice(0, apiKeys.length);
    return [
      ...apiKeyIds,
      ...Array.from({ length: apiKeys.length - apiKeyIds.length }, () => makeClientId()),
    ];
  }, [apiKeyIds, apiKeys.length]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const keyAliasInputId = `${apiKeyInputId}-alias`;
  const aliasModalInputId = useId();
  const aliasModalErrorId = `${aliasModalInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputAliasValue, setInputAliasValue] = useState('');
  const [formError, setFormError] = useState('');
  const [apiKeyAliases, setApiKeyAliases] = useState<ApiKeyAlias[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [aliasesAvailable, setAliasesAvailable] = useState(false);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [aliasEditingApiKeyId, setAliasEditingApiKeyId] = useState<string | null>(null);
  const [aliasInputValue, setAliasInputValue] = useState('');
  const [aliasFormError, setAliasFormError] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);
  const [apiKeyAccessRules, setApiKeyAccessRules] = useState<ApiKeyAccessRule[]>(accessRules);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessApiKey, setAccessApiKey] = useState('');
  const [accessUnrestricted, setAccessUnrestricted] = useState(true);
  const [accessModelsText, setAccessModelsText] = useState('');
  const [accessAuthIDs, setAccessAuthIDs] = useState<string[]>([]);
  const [accessProviders, setAccessProviders] = useState<string[]>([]);
  const [accessProviderOptions, setAccessProviderOptions] = useState<ApiKeyAccessProvider[]>([]);
  const [accessCredentials, setAccessCredentials] = useState<ApiKeyAccessCredential[]>([]);
  const [accessSearch, setAccessSearch] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessFormError, setAccessFormError] = useState('');

  const aliasByHash = useMemo(() => {
    const map = new Map<string, ApiKeyAlias>();
    apiKeyAliases.forEach((item) => {
      const hash = String(item.apiKeyHash || '')
        .trim()
        .toLowerCase();
      const alias = String(item.alias || '').trim();
      if (!hash || !alias) return;
      map.set(hash, { ...item, apiKeyHash: hash, alias });
    });
    return map;
  }, [apiKeyAliases]);

  const accessRuleByApiKey = useMemo(
    () => new Map(apiKeyAccessRules.map((rule) => [rule.apiKey, rule])),
    [apiKeyAccessRules]
  );
  const visibleAccessCredentials = useMemo(() => {
    const search = accessSearch.trim().toLowerCase();
    if (!search) return accessCredentials;
    return accessCredentials.filter((credential) =>
      [credential.name, credential.provider, credential.status]
        .map((value) => String(value ?? '').toLowerCase())
        .some((value) => value.includes(search))
    );
  }, [accessCredentials, accessSearch]);

  useEffect(() => {
    setApiKeyAccessRules(accessRules);
  }, [accessRules]);

  const resolveAliasServiceBase = useCallback(
    async (): Promise<string> =>
      featureAvailability.modelPricesAvailable ? featureAvailability.serviceBase : '',
    [featureAvailability.modelPricesAvailable, featureAvailability.serviceBase]
  );

  useEffect(() => {
    let cancelled = false;

    const loadAliases = async () => {
      setAliasesLoading(true);
      try {
        const serviceBase = await resolveAliasServiceBase();
        if (cancelled) return;
        if (!serviceBase) {
          setAliasesAvailable(false);
          setApiKeyAliases([]);
          return;
        }
        const response = await usageServiceApi.getApiKeyAliases(serviceBase, managementKey);
        if (cancelled) return;
        setAliasesAvailable(true);
        setApiKeyAliases(Array.isArray(response.items) ? response.items : []);
      } catch {
        if (cancelled) return;
        setAliasesAvailable(false);
        setApiKeyAliases([]);
      } finally {
        if (!cancelled) {
          setAliasesLoading(false);
        }
      }
    };

    void loadAliases();

    return () => {
      cancelled = true;
    };
  }, [managementKey, resolveAliasServiceBase]);

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const getApiKeyHash = (apiKey: string) => sha256Hex(apiKey).toLowerCase();

  const getAliasForApiKey = (apiKey: string) => {
    const hash = getApiKeyHash(apiKey);
    return hash ? (aliasByHash.get(hash)?.alias ?? '') : '';
  };

  const collectActiveApiKeyHashes = (keys: string[]) =>
    Array.from(
      new Set(
        keys
          .map((key) => getApiKeyHash(key))
          .map((hash) => hash.trim().toLowerCase())
          .filter(Boolean)
      )
    );

  const normalizeAliasKey = (alias: string) => alias.trim().toLowerCase();

  const isDuplicateAlias = (
    alias: string,
    currentApiKeyHash: string,
    activeApiKeyHashes?: string[]
  ) => {
    const aliasKey = normalizeAliasKey(alias);
    const currentHash = currentApiKeyHash.trim().toLowerCase();
    const activeHashSet =
      activeApiKeyHashes && activeApiKeyHashes.length > 0
        ? new Set(activeApiKeyHashes.map((hash) => hash.trim().toLowerCase()).filter(Boolean))
        : null;
    if (!aliasKey) return false;
    return apiKeyAliases.some((item) => {
      const itemHash = String(item.apiKeyHash || '')
        .trim()
        .toLowerCase();
      if (activeHashSet && !activeHashSet.has(itemHash)) return false;
      return itemHash !== currentHash && normalizeAliasKey(String(item.alias || '')) === aliasKey;
    });
  };

  const findOrphanAliasConflict = (
    alias: string,
    currentApiKeyHash: string,
    activeApiKeyHashes?: string[]
  ): OrphanAliasConflict | null => {
    const aliasKey = normalizeAliasKey(alias);
    const currentHash = currentApiKeyHash.trim().toLowerCase();
    if (!aliasKey || !activeApiKeyHashes || activeApiKeyHashes.length === 0) return null;

    const activeHashSet = new Set(
      activeApiKeyHashes.map((hash) => hash.trim().toLowerCase()).filter(Boolean)
    );

    for (const item of apiKeyAliases) {
      const itemHash = String(item.apiKeyHash || '')
        .trim()
        .toLowerCase();
      const itemAlias = String(item.alias || '').trim();
      if (!itemHash || itemHash === currentHash || activeHashSet.has(itemHash)) continue;
      if (normalizeAliasKey(itemAlias) === aliasKey) {
        return { apiKeyHash: itemHash, alias: itemAlias };
      }
    }

    return null;
  };

  const requestOrphanAliasCleanup = async (
    alias: string,
    currentApiKeyHash: string,
    activeApiKeyHashes?: string[]
  ): Promise<{ shouldContinue: boolean; allowOrphanAliasCleanup: boolean }> => {
    const conflict = findOrphanAliasConflict(alias, currentApiKeyHash, activeApiKeyHashes);
    if (!conflict) {
      return { shouldContinue: true, allowOrphanAliasCleanup: false };
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      showConfirmation({
        title: t('config_management.visual.api_keys.alias_cleanup_title'),
        message: (
          <>
            <p style={{ margin: '0 0 0.75rem' }}>
              {t('config_management.visual.api_keys.alias_cleanup_confirm', {
                alias: conflict.alias,
              })}
            </p>
            <p style={{ margin: 0 }}>
              {t('config_management.visual.api_keys.alias_cleanup_risk', {
                hash: conflict.apiKeyHash.slice(0, 12),
              })}
            </p>
          </>
        ),
        confirmText: t('config_management.visual.api_keys.alias_cleanup_confirm_action'),
        variant: 'danger',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    return { shouldContinue: confirmed, allowOrphanAliasCleanup: confirmed };
  };

  const validateAlias = (
    alias: string,
    currentApiKeyHash: string = '',
    activeApiKeyHashes?: string[]
  ) => {
    const trimmed = alias.trim();
    if (!trimmed) {
      return t('config_management.visual.api_keys.alias_error_empty');
    }
    if (Array.from(trimmed).length > 120) {
      return t('config_management.visual.api_keys.alias_error_too_long');
    }
    if (isDuplicateAlias(trimmed, currentApiKeyHash, activeApiKeyHashes)) {
      return t('config_management.visual.api_keys.alias_error_duplicate');
    }
    return '';
  };

  const saveAliasForKey = async (
    apiKey: string,
    alias: string,
    activeApiKeyHashes?: string[],
    allowOrphanAliasCleanup = false
  ) => {
    const apiKeyHash = getApiKeyHash(apiKey);
    const trimmedAlias = alias.trim();
    if (!apiKeyHash) {
      throw new Error(t('config_management.visual.api_keys.error_empty'));
    }
    const validationError = validateAlias(trimmedAlias, apiKeyHash, activeApiKeyHashes);
    if (validationError) {
      throw new Error(validationError);
    }

    const serviceBase = await resolveAliasServiceBase();
    if (!serviceBase) {
      throw new Error(t('config_management.visual.api_keys.alias_unavailable'));
    }

    const items = [
      ...apiKeyAliases.filter(
        (item) => String(item.apiKeyHash || '').trim().toLowerCase() !== apiKeyHash
      ),
      { apiKeyHash, alias: trimmedAlias },
    ];
    const response = await usageServiceApi.saveApiKeyAliases(
      serviceBase,
      items,
      managementKey,
      activeApiKeyHashes,
      allowOrphanAliasCleanup
    );
    setAliasesAvailable(true);
    setApiKeyAliases(Array.isArray(response.items) ? response.items : []);
  };

  const deleteAliasForHash = async (apiKeyHash: string) => {
    const serviceBase = await resolveAliasServiceBase();
    if (!serviceBase) {
      throw new Error(t('config_management.visual.api_keys.alias_unavailable'));
    }

    await usageServiceApi.deleteApiKeyAlias(serviceBase, apiKeyHash, managementKey);
    setApiKeyAliases((previous) =>
      previous.filter((item) => item.apiKeyHash.toLowerCase() !== apiKeyHash.toLowerCase())
    );
  };

  const getAliasErrorMessage = (error: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'api_key_alias_duplicate'
    ) {
      return t('config_management.visual.api_keys.alias_error_duplicate');
    }
    return error instanceof Error ? error.message : String(error);
  };

  const openAddModal = () => {
    setEditingApiKeyId(null);
    setInputValue('');
    setInputAliasValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    const editingKey = apiKeys[editingIndex] ?? '';
    setEditingApiKeyId(apiKeyId);
    setInputValue(editingKey);
    setInputAliasValue(getAliasForApiKey(editingKey));
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setInputAliasValue('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const openAliasModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    const editingKey = apiKeys[editingIndex] ?? '';
    setAliasEditingApiKeyId(apiKeyId);
    setAliasInputValue(getAliasForApiKey(editingKey));
    setAliasFormError('');
    setAliasModalOpen(true);
  };

  const closeAliasModal = () => {
    setAliasModalOpen(false);
    setAliasEditingApiKeyId(null);
    setAliasInputValue('');
    setAliasFormError('');
  };

  const openAccessModal = async (apiKey: string) => {
    setAccessApiKey(apiKey);
    setAccessSearch('');
    setAccessFormError('');
    setAccessModalOpen(true);
    setAccessLoading(true);
    try {
      const options = await apiKeyAccessApi.options();
      const rule = apiKeyAccessRules.find((item) => item.apiKey === apiKey);
      setAccessProviderOptions(options.providers);
      setAccessUnrestricted(!rule);
      setAccessModelsText((rule?.models ?? []).join('\n'));
      setAccessAuthIDs(rule?.authIds ?? []);
      setAccessProviders(rule?.providers ?? []);
      setAccessCredentials(options.credentials);
    } catch (error) {
      setAccessFormError(
        error instanceof Error
          ? error.message
          : t('config_management.visual.api_keys.access_load_failed')
      );
    } finally {
      setAccessLoading(false);
    }
  };

  const closeAccessModal = () => {
    setAccessModalOpen(false);
    setAccessApiKey('');
    setAccessModelsText('');
    setAccessAuthIDs([]);
    setAccessProviders([]);
    setAccessCredentials([]);
    setAccessSearch('');
    setAccessFormError('');
  };

  const isAccessProviderSelected = (provider: ApiKeyAccessProvider) =>
    accessProviders.includes(provider.id);

  const toggleAccessProvider = (provider: ApiKeyAccessProvider, checked: boolean) => {
    setAccessProviders((current) =>
      checked
        ? Array.from(new Set([...current, provider.id]))
        : current.filter((candidate) => candidate !== provider.id)
    );
  };

  const toggleAccessAuthID = (authID: string, checked: boolean) => {
    setAccessAuthIDs((current) =>
      checked ? Array.from(new Set([...current, authID])) : current.filter((id) => id !== authID)
    );
  };

  const toggleAllAccessProviders = () => {
    setAccessProviders((current) => {
      const allSelected =
        accessProviderOptions.length > 0 &&
        accessProviderOptions.every((provider) => current.includes(provider.id));
      return allSelected
        ? []
        : Array.from(new Set(accessProviderOptions.map((provider) => provider.id)));
    });
  };

  const toggleAllAccessCredentials = () => {
    setAccessAuthIDs((current) => {
      const allSelected =
        accessCredentials.length > 0 &&
        accessCredentials.every((credential) => current.includes(credential.id));
      return allSelected
        ? []
        : Array.from(new Set(accessCredentials.map((credential) => credential.id)));
    });
  };

  const saveAccessRule = async () => {
    if (!accessApiKey) return;
    const accessModels = Array.from(
      new Set(
        accessModelsText
          .split(/[\n,]/)
          .map((model) => model.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (
      !accessUnrestricted &&
      accessModels.length === 0 &&
      accessAuthIDs.length === 0 &&
      accessProviders.length === 0
    ) {
      setAccessFormError(t('config_management.visual.api_keys.access_required'));
      return;
    }
    const nextRules = apiKeyAccessRules.filter((rule) => rule.apiKey !== accessApiKey);
    if (!accessUnrestricted) {
      nextRules.push({
        apiKey: accessApiKey,
        models: accessModels,
        authIds: accessAuthIDs,
        providers: accessProviders,
      });
    }
    setAccessSaving(true);
    setAccessFormError('');
    try {
      await apiKeyAccessApi.replace(nextRules);
      setApiKeyAccessRules(nextRules);
      await onAccessRulesSaved();
      showNotification(
        t(
          accessUnrestricted
            ? 'config_management.visual.api_keys.access_cleared'
            : 'config_management.visual.api_keys.access_saved'
        ),
        'success'
      );
      closeAccessModal();
    } catch (error) {
      setAccessFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccessSaving(false);
    }
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join('\n'));
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    const trimmedAlias = inputAliasValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }
    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    const activeApiKeyHashes = collectActiveApiKeyHashes(nextKeys);

    if (trimmedAlias) {
      const aliasError = validateAlias(trimmedAlias, getApiKeyHash(trimmed), activeApiKeyHashes);
      if (aliasError) {
        setFormError(aliasError);
        return;
      }
      if (!aliasesAvailable) {
        setFormError(t('config_management.visual.api_keys.alias_unavailable'));
        return;
      }
    }

    if (trimmedAlias) {
      const cleanupDecision = await requestOrphanAliasCleanup(
        trimmedAlias,
        getApiKeyHash(trimmed),
        activeApiKeyHashes
      );
      if (!cleanupDecision.shouldContinue) {
        setFormError(t('config_management.visual.api_keys.alias_cleanup_cancelled'));
        return;
      }
      try {
        setAliasSaving(true);
        await saveAliasForKey(
          trimmed,
          trimmedAlias,
          activeApiKeyHashes,
          cleanupDecision.allowOrphanAliasCleanup
        );
        showNotification(t('config_management.visual.api_keys.alias_saved'), 'success');
      } catch (error) {
        setFormError(getAliasErrorMessage(error));
        setAliasSaving(false);
        return;
      }
      setAliasSaving(false);
    }

    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    updateApiKeys(nextKeys);
    closeModal();
  };

  const handleAliasSave = async () => {
    const editingIndex = aliasEditingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === aliasEditingApiKeyId)
      : -1;
    const editingKey = apiKeys[editingIndex] ?? '';
    const activeApiKeyHashes = collectActiveApiKeyHashes(apiKeys);
    const aliasError = validateAlias(aliasInputValue, getApiKeyHash(editingKey), activeApiKeyHashes);
    if (aliasError) {
      setAliasFormError(aliasError);
      return;
    }

    const cleanupDecision = await requestOrphanAliasCleanup(
      aliasInputValue,
      getApiKeyHash(editingKey),
      activeApiKeyHashes
    );
    if (!cleanupDecision.shouldContinue) {
      setAliasFormError(t('config_management.visual.api_keys.alias_cleanup_cancelled'));
      return;
    }

    setAliasSaving(true);
    try {
      await saveAliasForKey(
        editingKey,
        aliasInputValue,
        activeApiKeyHashes,
        cleanupDecision.allowOrphanAliasCleanup
      );
      showNotification(t('config_management.visual.api_keys.alias_saved'), 'success');
      closeAliasModal();
    } catch (error) {
      setAliasFormError(getAliasErrorMessage(error));
    } finally {
      setAliasSaving(false);
    }
  };

  const handleAliasDelete = () => {
    const editingIndex = aliasEditingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === aliasEditingApiKeyId)
      : -1;
    const editingKey = apiKeys[editingIndex] ?? '';
    const apiKeyHash = getApiKeyHash(editingKey);
    if (!apiKeyHash || !aliasByHash.has(apiKeyHash)) return;

    showConfirmation({
      title: t('config_management.visual.api_keys.alias_delete_title'),
      message: t('config_management.visual.api_keys.alias_delete_confirm'),
      confirmText: t('config_management.visual.api_keys.alias_delete'),
      variant: 'danger',
      onConfirm: async () => {
        setAliasSaving(true);
        try {
          await deleteAliasForHash(apiKeyHash);
          showNotification(t('config_management.visual.api_keys.alias_deleted'), 'success');
          closeAliasModal();
        } catch (error) {
          setAliasFormError(getAliasErrorMessage(error));
        } finally {
          setAliasSaving(false);
        }
      },
    });
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.api_keys.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {apiKeys.map((key, index) => {
            const apiKeyHash = getApiKeyHash(key);
            const alias = apiKeyHash ? (aliasByHash.get(apiKeyHash)?.alias ?? '') : '';
            const accessRule = accessRuleByApiKey.get(key);
            return (
              <div key={renderApiKeyIds[index] ?? `${key}-${index}`} className="item-row">
                <div className="item-meta">
                  <div className="item-title">
                    {alias || t('config_management.visual.api_keys.input_label')}
                  </div>
                  <div className="item-subtitle">{maskApiKey(String(key || ''))}</div>
                </div>
                <div className="item-actions">
                  <span className={styles.apiKeyAccessStatus}>
                    {accessRule
                      ? t('config_management.visual.api_keys.access_restricted')
                      : t('config_management.visual.api_keys.access_all')}
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => void openAccessModal(key)}
                    disabled={disabled}
                  >
                    {t('config_management.visual.api_keys.access_action')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => openAliasModal(renderApiKeyIds[index] ?? '')}
                    disabled={disabled || aliasesLoading || !aliasesAvailable}
                  >
                    {t('config_management.visual.api_keys.alias_action')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => handleCopy(key)}
                    disabled={disabled}
                  >
                    {t('common.copy')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>
      {!aliasesAvailable && !aliasesLoading ? (
        <div className="hint">{t('config_management.visual.api_keys.alias_unavailable')}</div>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingApiKeyId !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled || aliasSaving}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled || aliasSaving}>
              {editingApiKeyId !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>
            {t('config_management.visual.api_keys.input_label')}
          </label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <div id={apiKeyHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          <div className="form-group">
            <label htmlFor={keyAliasInputId}>
              {t('config_management.visual.api_keys.alias_label')}
            </label>
            <input
              id={keyAliasInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.alias_placeholder')}
              value={inputAliasValue}
              onChange={(e) => setInputAliasValue(e.target.value)}
              disabled={disabled || aliasesLoading || !aliasesAvailable}
              maxLength={120}
            />
            <div className="hint">{t('config_management.visual.api_keys.alias_hint')}</div>
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={aliasModalOpen}
        onClose={closeAliasModal}
        title={t('config_management.visual.api_keys.alias_title')}
        footer={
          <>
            {aliasEditingApiKeyId &&
            aliasByHash.has(
              getApiKeyHash(
                apiKeys[renderApiKeyIds.findIndex((id) => id === aliasEditingApiKeyId)] ?? ''
              )
            ) ? (
              <Button
                variant="danger"
                onClick={handleAliasDelete}
                disabled={disabled || aliasSaving}
              >
                {t('config_management.visual.api_keys.alias_delete')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={closeAliasModal}
              disabled={disabled || aliasSaving}
            >
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleAliasSave} disabled={disabled || aliasSaving}>
              {t('config_management.visual.common.update')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={aliasModalInputId}>
            {t('config_management.visual.api_keys.alias_label')}
          </label>
          <input
            id={aliasModalInputId}
            className="input"
            placeholder={t('config_management.visual.api_keys.alias_placeholder')}
            value={aliasInputValue}
            onChange={(e) => {
              setAliasInputValue(e.target.value);
              setAliasFormError('');
            }}
            disabled={disabled || aliasSaving}
            maxLength={120}
            aria-describedby={aliasFormError ? aliasModalErrorId : undefined}
            aria-invalid={Boolean(aliasFormError)}
          />
          <div className="hint">{t('config_management.visual.api_keys.alias_hint')}</div>
          {aliasFormError && (
            <div id={aliasModalErrorId} className="error-box">
              {aliasFormError}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={accessModalOpen}
        onClose={closeAccessModal}
        title={t('config_management.visual.api_keys.access_title')}
        footer={
          <>
            <Button variant="secondary" onClick={closeAccessModal} disabled={disabled || accessSaving}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={() => void saveAccessRule()} disabled={disabled || accessSaving || accessLoading}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <ToggleSwitch
            checked={accessUnrestricted}
            onChange={(checked) => {
              setAccessUnrestricted(checked);
              setAccessFormError('');
            }}
            label={t('config_management.visual.api_keys.access_all')}
            disabled={disabled || accessLoading || accessSaving}
          />
          <div className="hint">{t('config_management.visual.api_keys.access_all_hint')}</div>
        </div>

        {!accessUnrestricted ? (
          <>
            <div className="form-group">
              <label htmlFor={`${apiKeyInputId}-access-models`}>
                {t('config_management.visual.api_keys.access_models')}
              </label>
              <textarea
                id={`${apiKeyInputId}-access-models`}
                className="input"
                value={accessModelsText}
                onChange={(event) => setAccessModelsText(event.target.value)}
                placeholder={t('config_management.visual.api_keys.access_models_placeholder')}
                disabled={disabled || accessLoading || accessSaving}
                rows={4}
              />
              <div className="hint">
                {t('config_management.visual.api_keys.access_models_hint')}
              </div>
            </div>

            <div className="form-group">
              <div className={`${styles.blockHeaderRow} ${styles.accessSelectionHeader}`}>
                <label style={{ margin: 0 }}>
                  {t('config_management.visual.api_keys.access_providers')}
                </label>
                <SelectionCheckbox
                  checked={
                    accessProviderOptions.length > 0 &&
                    accessProviderOptions.every((provider) => accessProviders.includes(provider.id))
                  }
                  onChange={toggleAllAccessProviders}
                  disabled={
                    disabled ||
                    accessLoading ||
                    accessSaving ||
                    accessProviderOptions.length === 0
                  }
                  label={t('auth_files.batch_select_all')}
                />
              </div>
              {accessProviderOptions.length === 0 ? (
                <div className="hint">{t('config_management.visual.api_keys.access_no_credentials')}</div>
              ) : (
                <div className="item-list" style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {accessProviderOptions.map((provider) => (
                    <SelectionCheckbox
                      key={provider.id}
                      checked={isAccessProviderSelected(provider)}
                      onChange={(checked) => toggleAccessProvider(provider, checked)}
                      disabled={disabled || accessLoading || accessSaving}
                      label={
                        <div>
                          <div>{provider.name}</div>
                          <div className="hint" style={{ margin: 0 }}>
                            {provider.type}
                          </div>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <div className={`${styles.blockHeaderRow} ${styles.accessSelectionHeader}`}>
                <label htmlFor={`${apiKeyInputId}-access-search`} style={{ margin: 0 }}>
                  {t('config_management.visual.api_keys.access_credentials')}
                </label>
                <SelectionCheckbox
                  checked={
                    accessCredentials.length > 0 &&
                    accessCredentials.every((credential) => accessAuthIDs.includes(credential.id))
                  }
                  onChange={toggleAllAccessCredentials}
                  disabled={disabled || accessLoading || accessSaving || accessCredentials.length === 0}
                  label={t('auth_files.batch_select_all')}
                />
              </div>
              <input
                id={`${apiKeyInputId}-access-search`}
                className="input"
                value={accessSearch}
                onChange={(event) => setAccessSearch(event.target.value)}
                placeholder={t('config_management.visual.api_keys.access_search_placeholder')}
                disabled={disabled || accessLoading || accessSaving}
              />
              {visibleAccessCredentials.length === 0 ? (
                <div className="hint">{t('config_management.visual.api_keys.access_no_credentials')}</div>
              ) : (
                <div className="item-list" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {visibleAccessCredentials.map((credential) => {
                    return (
                      <SelectionCheckbox
                        key={credential.id}
                        checked={accessAuthIDs.includes(credential.id)}
                        onChange={(checked) => toggleAccessAuthID(credential.id, checked)}
                        disabled={disabled || accessLoading || accessSaving}
                        label={
                          <div>
                            <div>{credential.name}</div>
                            <div className="hint" style={{ margin: 0 }}>
                              {credential.provider} · {credential.status || 'unknown'}
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
        {accessFormError ? <div className="error-box">{accessFormError}</div> : null}
      </Modal>
    </div>
  );
});

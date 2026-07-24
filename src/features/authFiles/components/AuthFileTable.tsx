import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import {
  IconDownload,
  IconModelCluster,
  IconRefreshCw,
  IconSettings,
  IconTimer,
  IconTrash2,
} from '@/components/ui/icons';
import { CODEX_CONFIG } from '@/components/quota';
import type { AuthFileItem } from '@/types';
import type { CodexQuotaState } from '@/types/quota';
import {
  normalizeRecentRequestAuthIndex,
  normalizeRecentRequestBuckets,
  normalizeUsageTotal,
  statusBarDataFromRecentRequests,
} from '@/utils/recentRequests';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  getAuthFileQuotaErrorMessage,
  getQuotaI18nPrefix,
  getCodexQuotaResetCreditsAvailableCount,
  useAuthFileQuotaRefresh,
} from '@/features/authFiles/components/AuthFileQuotaSection';
import {
  buildAuthFileTableQuotaItems,
  getAuthFilePlanLabel,
  type AuthFileCodexStatusBadge,
  type AuthFileCodexStatusSummary,
} from '@/features/authFiles/model/authFilesPageModel';
import {
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  QUOTA_PROVIDER_TYPES,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { resetCodexQuota, resolveAuthProvider } from '@/utils/quota';
import { useNotificationStore, useQuotaStore } from '@/stores';
import styles from '@/features/authFiles/AuthFilesPage.module.scss';

export type AuthFileTableProps = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  resolvedTheme: ResolvedTheme;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  getCodexStatus: (file: AuthFileItem) => AuthFileCodexStatusSummary;
  getCodexQuota: (file: AuthFileItem) => CodexQuotaState | undefined;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  getCodexStatusBadges: (file: AuthFileItem) => AuthFileCodexStatusBadge[];
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

export function AuthFileTable({
  files,
  selectedFiles,
  resolvedTheme,
  statusBarCache,
  getCodexStatus,
  getCodexQuota,
  disableControls,
  deleting,
  statusUpdating,
  getCodexStatusBadges,
  onShowModels,
  onDownload,
  onOpenPrefixProxyEditor,
  onDelete,
  onToggleStatus,
  onToggleSelect,
}: AuthFileTableProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.authFileTableWrapper}>
      <table className={styles.authFileTable}>
        <thead>
          <tr>
            <th scope="col" className={styles.authFileTableSelectCell}>
              <span className={styles.srOnly}>{t('auth_files.table_select')}</span>
            </th>
            <th scope="col">{t('auth_files.table_name')}</th>
            <th scope="col">{t('auth_files.table_type_plan')}</th>
            <th scope="col">{t('auth_files.table_status')}</th>
            <th scope="col">{t('auth_files.table_health')}</th>
            <th scope="col">{t('auth_files.table_quota')}</th>
            <th scope="col">{t('auth_files.table_usage')}</th>
            <th scope="col">{t('auth_files.table_error')}</th>
            <th scope="col" className={styles.authFileTableActionsCell}>
              {t('auth_files.table_actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
            const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
            const codexQuota = getCodexQuota(file);
            const codexStatus = getCodexStatus(file);
            const typeColor = getTypeColor(providerKey, resolvedTheme);
            const typeLabel = getTypeLabel(t, providerKey);
            const rawStatusMessage = getAuthFileStatusMessage(file);
            const statusLabel = isRuntimeOnly
              ? t('auth_files.type_virtual')
              : file.disabled
                ? t('auth_files.health_status_disabled')
                : rawStatusMessage
                  ? t('auth_files.health_status_warning')
                  : t('auth_files.health_status_healthy');
            const statusClass = isRuntimeOnly
              ? styles.authFileTableStatusVirtual
              : file.disabled
                ? styles.authFileTableStatusDisabled
                : rawStatusMessage
                  ? styles.authFileTableStatusWarning
                  : styles.authFileTableStatusActive;
            const showModelsButton = !isRuntimeOnly || providerKey === 'aistudio';
            const badges = getCodexStatusBadges(file);
            const planLabel =
              providerKey === 'codex'
                ? getAuthFilePlanLabel(file, t, codexQuota)
                : typeof file.subscription_title === 'string'
                  ? file.subscription_title.trim()
                  : typeof file.subscription_tier === 'string'
                    ? file.subscription_tier.trim()
                    : typeof file.subscription_type === 'string'
                      ? file.subscription_type.trim()
                      : '';
            const authIndexKey = normalizeRecentRequestAuthIndex(
              file.authIndex ?? file['auth_index']
            );
            const statusData =
              (authIndexKey && statusBarCache.get(authIndexKey)) ||
              statusBarDataFromRecentRequests(
                normalizeRecentRequestBuckets(file.recent_requests ?? file.recentRequests)
              );
            const errorCode =
              file.errorStatus ?? file['error_status'] ?? file.statusCode ?? file['status_code'];
            const errorMessage =
              typeof file.error === 'string' ? file.error.trim() : String(file.error ?? '').trim();
            const errorRecord = [
              errorCode !== undefined && errorCode !== null ? String(errorCode) : '',
              errorMessage,
              rawStatusMessage,
            ]
              .filter(Boolean)
              .filter((value, index, values) => values.indexOf(value) === index)
              .join(' · ');

            return (
              <tr key={file.name} className={file.disabled ? styles.authFileTableRowDisabled : ''}>
                <td className={styles.authFileTableSelectCell}>
                  {!isRuntimeOnly && (
                    <SelectionCheckbox
                      checked={selectedFiles.has(file.name)}
                      onChange={() => onToggleSelect(file.name)}
                      ariaLabel={
                        selectedFiles.has(file.name)
                          ? t('auth_files.batch_deselect')
                          : t('auth_files.batch_select_all')
                      }
                    />
                  )}
                </td>
                <td className={styles.authFileTableNameCell} title={file.name}>
                  <span className={styles.authFileTableName}>{file.name}</span>
                  {file.super_category ?? file.superCategory ? (
                    <span className={styles.authFileTableSubLabel}>
                      ⚡ {t('auth_files.super_category_display')}
                    </span>
                  ) : null}
                </td>
                <td className={styles.authFileTableTypeCell}>
                  <div className={styles.authFileTableTypeContent}>
                    <span
                      className={styles.typeBadge}
                      style={{
                        backgroundColor: typeColor.bg,
                        color: typeColor.text,
                        ...(typeColor.border ? { border: typeColor.border } : {}),
                      }}
                    >
                      {typeLabel}
                    </span>
                    {planLabel ? (
                      <span className={styles.authFileTablePlanBadge}>{planLabel}</span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className={styles.authFileTableStatusCell}>
                    <span className={`${styles.stateBadge} ${statusClass}`}>{statusLabel}</span>
                    {badges.map((badge) => (
                      <span key={badge.kind} className={styles.authFileTableStatusHint}>
                        {t(badge.labelKey, {
                          defaultValue: badge.defaultLabel,
                          ...badge.labelParams,
                        })}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={styles.authFileTableHealthCell}>
                  <ProviderStatusBar statusData={statusData} styles={styles} />
                </td>
                <td className={styles.authFileTableQuotaCell}>
                  <AuthFileTableQuotaCell
                    file={file}
                    codexStatus={codexStatus}
                    disableControls={disableControls}
                  />
                </td>
                <td className={styles.authFileTableUsageCell}>
                  <span className={styles.authFileTableSuccess}>{normalizeUsageTotal(file.success)}</span>
                  <span>/</span>
                  <span className={styles.authFileTableFailure}>{normalizeUsageTotal(file.failed)}</span>
                </td>
                <td className={styles.authFileTableErrorCell} title={errorRecord}>
                  {errorRecord || '-'}
                </td>
                <td className={styles.authFileTableActionsCell}>
                  <div className={styles.authFileTableActions}>
                    <QuotaActionButtons file={file} disableControls={disableControls} />
                    {showModelsButton && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => onShowModels(file)}
                        title={t('auth_files.models_button')}
                        aria-label={t('auth_files.models_button')}
                        disabled={disableControls}
                      >
                        <IconModelCluster size={14} />
                      </Button>
                    )}
                    {!isRuntimeOnly && (
                      <>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => onDownload(file.name)}
                          title={t('auth_files.download_button')}
                          aria-label={t('auth_files.download_button')}
                          disabled={disableControls}
                        >
                          <IconDownload size={14} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => onOpenPrefixProxyEditor(file)}
                          title={t('auth_files.prefix_proxy_button')}
                          aria-label={t('auth_files.prefix_proxy_button')}
                          disabled={disableControls}
                        >
                          <IconSettings size={14} />
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={() => onDelete(file.name)}
                          title={t('auth_files.delete_button')}
                          aria-label={t('auth_files.delete_button')}
                          disabled={disableControls || deleting === file.name}
                          loading={deleting === file.name}
                        >
                          <IconTrash2 size={14} />
                        </Button>
                        <ToggleSwitch
                          ariaLabel={t('auth_files.status_toggle_label')}
                          checked={!file.disabled}
                          disabled={disableControls || statusUpdating[file.name] === true}
                          onChange={(value) => onToggleStatus(file, value)}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type QuotaProgressProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
  detailLabel?: string | null;
};

function QuotaProgress({ label, percent, resetLabel, detailLabel }: QuotaProgressProps) {
  if (percent === null && !resetLabel) return null;

  const normalizedPercent =
    percent === null ? null : Math.max(0, Math.min(100, Number(percent)));
  const progressClass =
    normalizedPercent === null
      ? styles.authFileTableQuotaUnknown
      : normalizedPercent >= 70
        ? styles.authFileTableQuotaLow
        : normalizedPercent >= 30
          ? styles.authFileTableQuotaMedium
          : styles.authFileTableQuotaHigh;
  const metadataLabel = [detailLabel, resetLabel]
    .filter((value): value is string => Boolean(value && value !== '-'))
    .join(' · ');

  return (
    <div className={styles.authFileTableQuotaItem}>
      <div className={styles.authFileTableQuotaHeader}>
        <span title={label}>{label}</span>
        <strong>{normalizedPercent === null ? '--' : `${normalizedPercent.toFixed(0)}%`}</strong>
      </div>
      <div className={styles.authFileTableQuotaTrack}>
        <span
          className={`${styles.authFileTableQuotaFill} ${progressClass}`}
          style={{ width: `${normalizedPercent ?? 0}%` }}
        />
      </div>
      {metadataLabel ? (
        <span className={styles.authFileTableQuotaReset} title={metadataLabel}>
          {metadataLabel}
        </span>
      ) : null}
    </div>
  );
}

type AuthFileTableQuotaCellProps = {
  file: AuthFileItem;
  codexStatus: AuthFileCodexStatusSummary;
  disableControls: boolean;
};

function AuthFileTableQuotaCell({
  file,
  codexStatus,
  disableControls,
}: AuthFileTableQuotaCellProps) {
  const { t } = useTranslation();
  const quotaType = resolveTableQuotaType(file);
  const { quota, quotaStatus, canRefreshQuota, refreshQuotaForFile } = useAuthFileQuotaRefresh(
    file,
    quotaType,
    disableControls
  );

  if (!quotaType) return null;

  if (quotaStatus === 'loading') {
    return (
      <span className={styles.authFileTableQuotaPrompt}>
        {t(`${getQuotaI18nPrefix(quotaType)}.loading`)}
      </span>
    );
  }

  if (quotaStatus === 'error') {
    return (
      <div className={styles.authFileTableQuotaStack}>
        <div className={styles.quotaError}>
          {t(`${getQuotaI18nPrefix(quotaType)}.load_failed`, {
            message: getAuthFileQuotaErrorMessage(t, quota),
          })}
        </div>
      </div>
    );
  }

  const items = buildAuthFileTableQuotaItems(quotaType, quota, t, { codexStatus });

  if (items.length === 0) {
    return canRefreshQuota ? (
      <button
        type="button"
        className={styles.authFileTableQuotaPrompt}
        onClick={() => void refreshQuotaForFile()}
      >
        {t(`${getQuotaI18nPrefix(quotaType)}.idle`)}
      </button>
    ) : (
      <span className={styles.authFileTableQuotaPrompt}>-</span>
    );
  }

  return (
    <div className={styles.authFileTableQuotaStack}>
      {items.map((item) =>
        item.kind === 'meta' ? (
          <div key={item.id} className={styles.authFileTableQuotaItem}>
            <div className={styles.authFileTableQuotaHeader}>
              <span>{item.label}</span>
              <strong>{item.detail ?? '--'}</strong>
            </div>
          </div>
        ) : (
          <QuotaProgress
            key={item.id}
            label={item.label}
            percent={item.remainingPercent}
            resetLabel={item.detail}
          />
        )
      )}
    </div>
  );
}

type QuotaActionButtonsProps = {
  file: AuthFileItem;
  disableControls: boolean;
};

function QuotaActionButtons({ file, disableControls }: QuotaActionButtonsProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const quotaType = resolveTableQuotaType(file);
  const { quota, quotaStatus, canRefreshQuota, refreshQuotaForFile } = useAuthFileQuotaRefresh(
    file,
    quotaType,
    disableControls
  );
  const resetCreditsAvailableCount =
    quotaType === 'codex' ? getCodexQuotaResetCreditsAvailableCount(quota) : null;
  const canResetQuota =
    quotaType === 'codex' &&
    quotaStatus === 'success' &&
    canRefreshQuota &&
    (resetCreditsAvailableCount ?? 0) > 0;
  const handleResetQuota = useCallback(() => {
    if (!canResetQuota || quotaType !== 'codex') return;

    showConfirmation({
      title: t('codex_quota.reset_confirm_title'),
      message: t('codex_quota.reset_confirm_message', { key: file.name }),
      confirmText: t('codex_quota.reset_confirm_button'),
      variant: 'primary',
      onConfirm: async () => {
        try {
          const data = await resetCodexQuota(file, t);
          useQuotaStore.getState().setCodexQuota((prev) => ({
            ...prev,
            [file.name]: CODEX_CONFIG.buildSuccessState(data),
          }));
          window.dispatchEvent(new Event('auth-files-refresh'));
          showNotification(t('codex_quota.reset_success', { key: file.name }), 'success');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('common.unknown_error');
          showNotification(
            t('codex_quota.reset_failed', { key: file.name, message }),
            'error'
          );
        }
      },
    });
  }, [canResetQuota, file, quotaType, showConfirmation, showNotification, t]);

  if (!quotaType || !canRefreshQuota) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={() => void refreshQuotaForFile()}
        disabled={!canRefreshQuota}
        loading={quotaStatus === 'loading'}
        title={t('auth_files.quota_refresh_single')}
        aria-label={t('auth_files.quota_refresh_single')}
      >
        <IconRefreshCw size={14} />
      </Button>
      {canResetQuota ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className={styles.authFileTableQuotaResetButton}
          onClick={handleResetQuota}
          title={t('codex_quota.reset_button')}
          aria-label={t('codex_quota.reset_button')}
        >
          <IconTimer size={14} />
          <span className={styles.authFileTableQuotaResetBadge}>
            {resetCreditsAvailableCount && resetCreditsAvailableCount > 99
              ? '99+'
              : resetCreditsAvailableCount}
          </span>
        </Button>
      ) : null}
    </>
  );
}

function resolveTableQuotaType(file: AuthFileItem): QuotaProviderType | null {
  if (isRuntimeOnlyAuthFile(file)) return null;
  const provider = resolveAuthProvider(file);
  return QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)
    ? (provider as QuotaProviderType)
    : null;
}

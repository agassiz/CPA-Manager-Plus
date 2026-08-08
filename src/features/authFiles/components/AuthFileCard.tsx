import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CODEX_CONFIG } from '@/components/quota';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconInfo,
  IconModelCluster,
  IconRefreshCw,
  IconSettings,
  IconTimer,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { formatShanghaiDateTime, resetCodexQuota, resolveAuthProvider } from '@/utils/quota';
import {
  normalizeRecentRequestAuthIndex,
  normalizeRecentRequestBuckets,
  normalizeUsageTotal,
  statusBarDataFromRecentRequests,
} from '@/utils/recentRequests';
import { formatFileSize } from '@/utils/format';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  QUOTA_PROVIDER_TYPES,
  formatModified,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  getAuthFilePlanLabel,
  type AuthFileCodexStatusBadge,
} from '@/features/authFiles/model/authFilesPageModel';
import {
  AuthFileQuotaSection,
  getCodexQuotaResetCreditsAvailableCount,
  useAuthFileQuotaRefresh,
} from '@/features/authFiles/components/AuthFileQuotaSection';
import { useNotificationStore, useQuotaStore } from '@/stores';
import styles from '@/features/authFiles/AuthFilesPage.module.scss';
import type { CodexRateLimitResetCredit, CodexQuotaState } from '@/types/quota';

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);

const buildCodexResetConfirmMessage = (
  file: AuthFileItem,
  quota: CodexQuotaState | undefined,
  t: TFunction
) => {
  const count = quota?.rateLimitResetCreditsAvailableCount;
  const credits: CodexRateLimitResetCredit[] = quota?.rateLimitResetCredits ?? [];
  const error = quota?.rateLimitResetCreditsError ?? '';

  return (
    <div className={styles.resetConfirmContent}>
      <p>{t('codex_quota.reset_confirm_message', { key: file.name })}</p>
      {count !== undefined && count !== null ? (
        <div className={styles.resetConfirmSummary}>
          <span>{t('codex_quota.reset_credits_label')}</span>
          <strong>{count}</strong>
        </div>
      ) : null}
      {credits.length > 0 ? (
        <table className={styles.resetConfirmCreditsTable}>
          <thead>
            <tr>
              <th>{t('codex_quota.reset_card_label')}</th>
              <th>{t('codex_quota.reset_credit_granted_at_label')}</th>
              <th>{t('codex_quota.reset_credit_expires_at_label')}</th>
            </tr>
          </thead>
          <tbody>
            {credits.map((credit, index) => (
              <tr key={credit.id || `${credit.expiresAt}-${index}`}>
                <td>{index + 1}</td>
                <td>{formatShanghaiDateTime(credit.grantedAt) || '--'}</td>
                <td>{formatShanghaiDateTime(credit.expiresAt) || credit.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : error ? (
        <div className={styles.resetConfirmError}>
          {t('codex_quota.reset_credits_expiry_failed', { message: error })}
        </div>
      ) : null}
    </div>
  );
};

export type AuthFileCardProps = {
  file: AuthFileItem;
  compact: boolean;
  hideErrors?: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  codexStatusBadges?: AuthFileCodexStatusBadge[];
  codexQuota?: CodexQuotaState;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  showDeleteAction?: boolean;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

const getProjectIdValue = (file: AuthFileItem): string => {
  const raw =
    file.project_id ?? file.projectId ?? file.gemini_virtual_project ?? file.geminiVirtualProject;
  return typeof raw === 'string' ? raw.trim() : '';
};

const normalizeText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const formatKiroSubscriptionBadgeLabel = (file: AuthFileItem): string => {
  const title = normalizeText(file.subscription_title ?? file.subscriptionTitle);
  if (!title) return '';
  const compact = title.replace(/^KIRO\s+/i, '').trim();
  return (compact || title).toUpperCase();
};

const formatKiroAuthMethodBadgeLabel = (method: string): string => {
  switch (method.toLowerCase()) {
    case 'api_key':
    case 'api-key':
      return 'API Key';
    case 'builder-id':
    case 'builder_id':
    case 'builderid':
      return 'Builder ID';
    case 'idc':
      return 'IdC';
    case 'social':
      return 'Social';
    default:
      return '';
  }
};

const getKiroAccountTypeBadgeLabel = (file: AuthFileItem): string => {
  const direct = normalizeText(file.kiro_account_type_label ?? file.kiroAccountTypeLabel);
  if (direct) return direct;
  return formatKiroAuthMethodBadgeLabel(normalizeText(file.auth_method ?? file.authMethod));
};

const getKiroProfileBadgeLabel = (file: AuthFileItem): string => {
  return normalizeText(file.kiro_profile_badge_label ?? file.kiroProfileBadgeLabel);
};

export function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const {
    file,
    compact,
    hideErrors = false,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    statusBarCache,
    codexStatusBadges = [],
    codexQuota,
    onShowModels,
    onDownload,
    onOpenPrefixProxyEditor,
    onDelete,
    showDeleteAction = true,
    onToggleStatus,
    onToggleSelect,
  } = props;
  const [renderedAtMs] = useState(() => Date.now());

  const recentBuckets = normalizeRecentRequestBuckets(file.recent_requests ?? file.recentRequests);
  const fileStats = {
    success: normalizeUsageTotal(file.success),
    failure: normalizeUsageTotal(file.failed),
  };
  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
  const isAistudio = providerKey === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const typeColor = getTypeColor(providerKey, resolvedTheme);
  const typeLabel = getTypeLabel(t, providerKey);

  const quotaType = resolveQuotaType(file);
  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;
  const quotaRefresh = useAuthFileQuotaRefresh(file, quotaType, disableControls);
  const showQuotaRefreshButton =
    showQuotaLayout && quotaRefresh.quotaStatus !== 'loading' && quotaRefresh.canRefreshQuota;
  const resetCreditsAvailableCount =
    quotaType === 'codex'
      ? getCodexQuotaResetCreditsAvailableCount(quotaRefresh.quota)
      : null;
  const showQuotaResetButton =
    showQuotaLayout &&
    quotaType === 'codex' &&
    quotaRefresh.quotaStatus === 'success' &&
    quotaRefresh.canRefreshQuota &&
    (resetCreditsAvailableCount ?? 0) > 0;
  const canResetQuota =
    showQuotaResetButton &&
    (resetCreditsAvailableCount ?? 0) > 0 &&
    quotaRefresh.canRefreshQuota;
  const resetCreditsBadge =
    resetCreditsAvailableCount !== null && resetCreditsAvailableCount > 0
      ? resetCreditsAvailableCount > 99
        ? '99+'
        : String(resetCreditsAvailableCount)
      : null;

  const handleResetQuota = useCallback(() => {
    if (quotaType !== 'codex' || !canResetQuota) return;

    showConfirmation({
      title: t('codex_quota.reset_confirm_title'),
      message: buildCodexResetConfirmMessage(file, quotaRefresh.quota as CodexQuotaState, t),
      confirmText: t('codex_quota.reset_confirm_button'),
      variant: 'primary',
      onConfirm: async () => {
        try {
          const data = await resetCodexQuota(file, t);
          useQuotaStore.getState().setCodexQuota((prev) => ({
            ...prev,
            [file.name]: CODEX_CONFIG.buildSuccessState(data)
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
      }
    });
  }, [canResetQuota, file, quotaRefresh.quota, quotaType, showConfirmation, showNotification, t]);

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
        : quotaType === 'codex'
          ? styles.codexCard
          : quotaType === 'gemini-cli'
            ? styles.geminiCliCard
            : quotaType === 'kiro'
              ? styles.kiroCard
              : quotaType === 'kimi'
                ? styles.kimiCard
                : quotaType === 'xai'
                  ? styles.xaiCard
                  : '';

  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeRecentRequestAuthIndex(rawAuthIndex);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) ||
    statusBarDataFromRecentRequests(recentBuckets);
  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  const priorityValue = parsePriorityValue(file.priority ?? file['priority']);
  const isSuperCategory =
    providerKey === 'codex' && Boolean(file.super_category ?? file.superCategory);
  const cooldownUntilMs = parseTimestampMs(file.cooldown_until ?? file['cooldownUntil']);
  const isCooldownActive =
    providerKey !== 'antigravity' &&
    file.cooldown_active === true &&
    (!Number.isFinite(cooldownUntilMs) || cooldownUntilMs > renderedAtMs);
  const cooldownTitle = Number.isFinite(cooldownUntilMs)
    ? t('auth_files.cooldown_until', { time: new Date(cooldownUntilMs).toLocaleString() })
    : t('auth_files.cooldown_active');
  const projectIdValue = getProjectIdValue(file);
  const planLabel = providerKey === 'codex' ? getAuthFilePlanLabel(file, t, codexQuota) : null;
  const kiroSubscriptionBadgeLabel =
    providerKey === 'kiro' ? formatKiroSubscriptionBadgeLabel(file) : '';
  const kiroAccountTypeBadgeLabel =
    providerKey === 'kiro' ? getKiroAccountTypeBadgeLabel(file) : '';
  const kiroProfileBadgeLabel = providerKey === 'kiro' ? getKiroProfileBadgeLabel(file) : '';
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual') || '虚拟认证文件'
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : rawStatusMessage
          ? t('auth_files.health_status_healthy')
          : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRuntimeOnly
    ? styles.stateBadgeVirtual
    : file.disabled
      ? styles.stateBadgeDisabled
      : hasStatusWarning
        ? styles.stateBadgeWarning
        : styles.stateBadgeActive;
  const codexStatusBadgeClassByTone = {
    danger: styles.codexStatusBadgeDanger,
    warning: styles.codexStatusBadgeWarning,
    info: styles.codexStatusBadgeInfo,
  } satisfies Record<AuthFileCodexStatusBadge['tone'], string>;

  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && (
              <SelectionCheckbox
                checked={selected}
                onChange={() => onToggleSelect(file.name)}
                className={styles.cardSelection}
                aria-label={
                  selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')
                }
                title={selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')}
              />
            )}
            <div className={styles.cardHeaderContent}>
              <div className={styles.cardBadgeRow}>
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
                {kiroSubscriptionBadgeLabel && (
                  <span className={`${styles.stateBadge} ${styles.kiroPlanBadge}`}>
                    {kiroSubscriptionBadgeLabel}
                  </span>
                )}
                <span className={`${styles.stateBadge} ${stateBadgeClass}`}>{stateLabel}</span>
                {kiroAccountTypeBadgeLabel && (
                  <span className={`${styles.stateBadge} ${styles.kiroAccountBadge}`}>
                    {kiroAccountTypeBadgeLabel}
                  </span>
                )}
                {kiroProfileBadgeLabel && (
                  <span
                    className={`${styles.stateBadge} ${styles.kiroProfileBadge}`}
                    title="Profile ARN"
                  >
                    {kiroProfileBadgeLabel}
                  </span>
                )}
                {isCooldownActive && (
                  <span
                    className={`${styles.stateBadge} ${styles.stateBadgeCooldown}`}
                    title={cooldownTitle}
                  >
                    {t('auth_files.cooldown_active')}
                  </span>
                )}
                {isSuperCategory && (
                  <span
                    className={`${styles.stateBadge} ${styles.stateBadgeSuper}`}
                    title={t('auth_files.super_category_badge_title')}
                  >
                    ⚡ {t('auth_files.super_category_display')}
                  </span>
                )}
                {codexStatusBadges.map((badge) => {
                  const label = t(badge.labelKey, {
                    defaultValue: badge.defaultLabel,
                    ...badge.labelParams,
                  });
                  const title = badge.titleKey
                    ? t(badge.titleKey, {
                        defaultValue: badge.defaultTitle ?? badge.defaultLabel,
                        ...badge.labelParams,
                      })
                    : (badge.defaultTitle ?? label);

                  return (
                    <span
                      key={badge.kind}
                      className={`${styles.codexStatusBadge} ${codexStatusBadgeClassByTone[badge.tone]}`}
                      title={title}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
              <span className={styles.fileName} title={file.name}>
                {file.name}
              </span>
              {!compact && noteValue && (
                <div className={styles.noteText} title={noteValue}>
                  <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                  <span className={styles.noteValue}>{noteValue}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.cardMeta} ${compact ? styles.cardMetaCompact : ''}`}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_size')}</span>
              <span className={styles.metaValue}>
                {file.size ? formatFileSize(file.size) : '-'}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_modified')}</span>
              <span className={styles.metaValue}>{formatModified(file)}</span>
            </div>
            {planLabel && (
              <div className={`${styles.metaItem} ${styles.planMetaItem}`}>
                <span className={styles.metaLabel}>{t('codex_quota.plan_label')}</span>
                <span className={`${styles.metaValue} ${styles.planMetaValue}`}>{planLabel}</span>
              </div>
            )}
            {projectIdValue && (
              <div className={styles.metaItem} title={projectIdValue}>
                <span className={styles.metaLabel}>{t('auth_files.project_id_display')}</span>
                <span className={styles.metaValue}>{projectIdValue}</span>
              </div>
            )}
          </div>

          {rawStatusMessage && hasStatusWarning && !hideErrors && (
            <div className={styles.healthStatusMessage} title={rawStatusMessage}>
              <IconInfo className={styles.messageIcon} size={14} />
              <span>{rawStatusMessage}</span>
            </div>
          )}

          <div className={`${styles.cardInsights} ${compact ? styles.cardInsightsCompact : ''}`}>
            <div className={`${styles.cardStats} ${compact ? styles.cardStatsCompact : ''}`}>
              <div className={`${styles.statPill} ${styles.statSuccess}`}>
                <span className={styles.statLabel}>{t('stats.success')}</span>
                <span className={styles.statValue}>{fileStats.success}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statFailure}`}>
                <span className={styles.statLabel}>{t('stats.failure')}</span>
                <span className={styles.statValue}>{fileStats.failure}</span>
              </div>
            </div>

            <div className={`${styles.statusPanel} ${compact ? styles.statusPanelCompact : ''}`}>
              <div className={styles.statusPanelLabel}>
                <span>{t('auth_files.health_status_label')}</span>
              </div>
              <ProviderStatusBar statusData={statusData} styles={styles} />
            </div>

            {showQuotaLayout && quotaType && (
              <AuthFileQuotaSection
                file={file}
                quotaType={quotaType}
                disableControls={disableControls}
              />
            )}
          </div>

          <div className={styles.cardActions}>
            <div className={styles.cardActionsMain}>
              {(showModelsButton || !isRuntimeOnly) && (
                <div className={styles.cardUtilityActions}>
                  {showModelsButton && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onShowModels(file)}
                      className={`${styles.primaryActionButton} ${styles.modelsActionButton}`}
                      title={t('auth_files.models_button', { defaultValue: '模型' })}
                      aria-label={t('auth_files.models_button', { defaultValue: '模型' })}
                      disabled={disableControls}
                    >
                      <span className={styles.modelsActionIconWrap}>
                        <IconModelCluster className={styles.actionIcon} size={16} />
                      </span>
                    </Button>
                  )}
                  {!isRuntimeOnly && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onDownload(file.name)}
                        className={styles.iconButton}
                        title={t('auth_files.download_button')}
                        disabled={disableControls}
                      >
                        <IconDownload className={styles.actionIcon} size={16} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenPrefixProxyEditor(file)}
                        className={styles.iconButton}
                        title={t('auth_files.prefix_proxy_button')}
                        disabled={disableControls}
                      >
                        <IconSettings className={styles.actionIcon} size={16} />
                      </Button>
                      {showQuotaRefreshButton && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={styles.iconButton}
                          onClick={() => void quotaRefresh.refreshQuotaForFile()}
                          disabled={!quotaRefresh.canRefreshQuota}
                          title={t('auth_files.quota_refresh_single')}
                          aria-label={t('auth_files.quota_refresh_single')}
                        >
                          <IconRefreshCw className={styles.actionIcon} size={16} />
                        </Button>
                      )}
                      {showQuotaResetButton && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={`${styles.iconButton} ${styles.quotaResetButton}`}
                          onClick={handleResetQuota}
                          disabled={!canResetQuota}
                          title={t('codex_quota.reset_button')}
                          aria-label={t('codex_quota.reset_button')}
                        >
                          <IconTimer className={styles.actionIcon} size={16} />
                          {resetCreditsBadge ? (
                            <span className={styles.quotaResetBadge} aria-hidden="true">
                              {resetCreditsBadge}
                            </span>
                          ) : null}
                        </Button>
                      )}
                      {showDeleteAction ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onDelete(file.name)}
                          className={styles.iconButton}
                          title={t('auth_files.delete_button')}
                          disabled={disableControls || deleting === file.name}
                        >
                          {deleting === file.name ? (
                            <LoadingSpinner size={14} />
                          ) : (
                            <IconTrash2 className={styles.actionIcon} size={16} />
                          )}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
            {priorityValue !== undefined && priorityValue !== 0 && (
              <div className={styles.cardActionPriority}>
                <span className={styles.priorityActionBadge}>
                  <span className={styles.priorityActionLabel}>
                    {t('auth_files.priority_display')}
                  </span>
                  <span className={styles.priorityActionValue}>{priorityValue}</span>
                </span>
              </div>
            )}
            {!isRuntimeOnly && (
              <div className={styles.statusToggle}>
                <span className={styles.statusToggleLabel}>
                  {t('auth_files.status_toggle_label')}
                </span>
                <ToggleSwitch
                  ariaLabel={t('auth_files.status_toggle_label')}
                  checked={!file.disabled}
                  disabled={disableControls || statusUpdating[file.name] === true}
                  onChange={(value) => onToggleStatus(file, value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

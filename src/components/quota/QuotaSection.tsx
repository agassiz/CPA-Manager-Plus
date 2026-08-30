/**
 * Generic quota section component.
 */

import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, CodexRateLimitResetCredit, ResolvedTheme } from '@/types';
import { formatShanghaiDateTime, getStatusFromError, isUpstreamStatusError } from '@/utils/quota';
import { QuotaCard } from './QuotaCard';
import type { QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig, QuotaSortMode } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from '@/features/quota/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

const MAX_ITEMS_PER_PAGE = 25;
const MAX_SHOW_ALL_THRESHOLD = 30;
type QuotaSectionViewMode = 'paged' | 'all';

const stringifySearchValue = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(stringifySearchValue);
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return [];
};

const compareFileName = (left: AuthFileItem, right: AuthFileItem) =>
  left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

type CodexResetQuotaState = {
  rateLimitResetCreditsAvailableCount?: number | null;
  rateLimitResetCredits?: CodexRateLimitResetCredit[];
  rateLimitResetCreditsError?: string;
};

const getCodexResetQuotaState = (quota: unknown): CodexResetQuotaState | null => {
  if (!quota || typeof quota !== 'object' || !('rateLimitResetCreditsAvailableCount' in quota)) {
    return null;
  }
  return quota as CodexResetQuotaState;
};

const buildResetQuotaConfirmMessage = (file: AuthFileItem, quota: unknown, t: TFunction) => {
  const resetQuota = getCodexResetQuotaState(quota);
  const count = resetQuota?.rateLimitResetCreditsAvailableCount;
  const credits = resetQuota?.rateLimitResetCredits ?? [];
  const error = resetQuota?.rateLimitResetCreditsError ?? '';

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

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPageSize: (size: number) => void;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  loadingScope: 'page' | 'all' | null;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = 6): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);
  const [loadingScope, setLoadingScope] = useState<'page' | 'all' | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const setLoading = useCallback((isLoading: boolean, scope?: 'page' | 'all' | null) => {
    setLoadingState(isLoading);
    setLoadingScope(isLoading ? (scope ?? null) : null);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading,
    loadingScope,
    setLoading,
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
  searchQuery?: string;
  sortMode?: QuotaSortMode;
}

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled,
  searchQuery = '',
  sortMode = 'default',
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  /* Removed useRef */
  const [columns, gridRef] = useGridColumns(380); // Min card width 380px matches SCSS
  const [viewMode, setViewMode] = useState<QuotaSectionViewMode>('paged');
  const [showTooManyWarning, setShowTooManyWarning] = useState(false);
  const [forceShowAll, setForceShowAll] = useState(false);
  const [resettingQuotaName, setResettingQuotaName] = useState<string | null>(null);

  const filteredFiles = useMemo(
    () => files.filter((file) => config.filterFn(file)),
    [files, config]
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const { quota, loadQuota } = useQuotaLoader(config);

  const displayFiles = useMemo(() => {
    const matchesSearch = (file: AuthFileItem): boolean => {
      if (!normalizedSearchQuery) return true;
      const fileQuota = quota[file.name];
      const searchValues = [
        file.name,
        file.type,
        file.provider,
        file.authIndex,
        file['auth_index'],
        file.status,
        file.statusMessage,
        fileQuota?.status,
        fileQuota?.error,
        fileQuota?.errorStatus,
        ...(config.getSearchText?.(file, fileQuota, t) ?? []),
      ];

      return stringifySearchValue(searchValues).some((value) =>
        value.toLowerCase().includes(normalizedSearchQuery)
      );
    };

    const nextFiles = filteredFiles.filter(matchesSearch);
    const sortedFiles = [...nextFiles];

    if (sortMode === 'name-asc') {
      sortedFiles.sort(compareFileName);
      return sortedFiles;
    }

    if (sortMode === 'plan-asc' || sortMode === 'plan-desc') {
      sortedFiles.sort((left, right) => {
        const leftRank = config.getPlanSortRank?.(left, quota[left.name]);
        const rightRank = config.getPlanSortRank?.(right, quota[right.name]);
        const leftKnown = leftRank !== null && leftRank !== undefined;
        const rightKnown = rightRank !== null && rightRank !== undefined;

        if (leftKnown || rightKnown) {
          if (!leftKnown) return 1;
          if (!rightKnown) return -1;
          const rankDiff = sortMode === 'plan-desc' ? rightRank - leftRank : leftRank - rightRank;
          if (rankDiff !== 0) return rankDiff;
        }

        return compareFileName(left, right);
      });
    }

    return sortedFiles;
  }, [config, filteredFiles, normalizedSearchQuery, quota, sortMode, t]);

  const showAllAllowed = forceShowAll || displayFiles.length <= MAX_SHOW_ALL_THRESHOLD;
  const effectiveViewMode: QuotaSectionViewMode =
    viewMode === 'all' && !showAllAllowed ? 'paged' : viewMode;

  useEffect(() => {
    const resetView = () => {
      setViewMode('paged');
      setForceShowAll(false);
      setShowTooManyWarning(false);
    };

    window.addEventListener('quota-page-reset-view', resetView);
    return () => {
      window.removeEventListener('quota-page-reset-view', resetView);
    };
  }, []);

  const {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading: sectionLoading,
    setLoading,
  } = useQuotaPagination(displayFiles);

  useEffect(() => {
    if (showAllAllowed) return;
    if (viewMode !== 'all') return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setViewMode('paged');
      setShowTooManyWarning(true);
    });

    return () => {
      cancelled = true;
    };
  }, [viewMode, showAllAllowed]);

  // Update page size based on view mode and columns
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, displayFiles.length));
    } else {
      // Paged mode: 3 rows * columns, capped to avoid oversized pages.
      setPageSize(Math.min(columns * 3, MAX_ITEMS_PER_PAGE));
    }
  }, [effectiveViewMode, columns, displayFiles.length, setPageSize]);

  const pendingQuotaRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);

  const handleRefresh = useCallback(() => {
    pendingQuotaRefreshRef.current = true;
    void triggerHeaderRefresh();
  }, []);

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    if (!pendingQuotaRefreshRef.current) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = false;
    const scope = effectiveViewMode === 'all' ? 'all' : 'page';
    const targets = effectiveViewMode === 'all' ? displayFiles : pageItems;
    if (targets.length === 0) return;
    loadQuota(targets, scope, setLoading);
  }, [loading, effectiveViewMode, displayFiles, pageItems, loadQuota, setLoading]);

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }
    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const refreshQuotaForFile = useCallback(
    async (file: AuthFileItem) => {
      if (disabled || file.disabled) return;
      if (quota[file.name]?.status === 'loading') return;

      setQuota((prev) => ({
        ...prev,
        [file.name]: config.buildLoadingState(),
      }));

      try {
        const data = await config.fetchQuota(file, t);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildSuccessState(data),
        }));
        showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        const upstreamError = isUpstreamStatusError(err);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildErrorState(message, status, upstreamError),
        }));
        showNotification(
          t('auth_files.quota_refresh_failed', { name: file.name, message }),
          'error'
        );
      }
    },
    [config, disabled, quota, setQuota, showNotification, t]
  );

  const resetQuotaForFile = useCallback(
    (file: AuthFileItem) => {
      const resetQuota = config.resetQuota;
      if (!resetQuota) return;
      if (disabled || file.disabled) return;
      const currentQuota = quota[file.name];
      if (currentQuota?.status === 'loading') return;
      if (resettingQuotaName === file.name) return;

      showConfirmation({
        title: t('codex_quota.reset_confirm_title'),
        message: buildResetQuotaConfirmMessage(file, currentQuota, t),
        confirmText: t('codex_quota.reset_confirm_button'),
        variant: 'primary',
        onConfirm: async () => {
          setResettingQuotaName(file.name);
          try {
            const data = await resetQuota(file, t);
            setQuota((prev) => ({
              ...prev,
              [file.name]: config.buildSuccessState(data),
            }));
            showNotification(t('codex_quota.reset_success', { key: file.name }), 'success');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.unknown_error');
            showNotification(t('codex_quota.reset_failed', { key: file.name, message }), 'error');
          } finally {
            setResettingQuotaName((current) => (current === file.name ? null : current));
          }
        },
      });
    },
    [config, disabled, quota, resettingQuotaName, setQuota, showConfirmation, showNotification, t]
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && (
        <span className={styles.countBadge}>
          {normalizedSearchQuery ? displayFiles.length : filteredFiles.length}
        </span>
      )}
    </div>
  );

  const isRefreshing = sectionLoading || loading;

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <div className={styles.viewModeToggle}>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'paged' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => {
                setViewMode('paged');
                setForceShowAll(false);
              }}
            >
              {t('auth_files.view_mode_paged')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'all' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => {
                if (effectiveViewMode === 'all') return;
                if (displayFiles.length > MAX_SHOW_ALL_THRESHOLD) {
                  setShowTooManyWarning(true);
                } else {
                  setViewMode('all');
                }
              }}
            >
              {t('auth_files.view_mode_all')}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshAllButton}
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
            loading={isRefreshing}
            title={t('quota_management.refresh_all_credentials')}
            aria-label={t('quota_management.refresh_all_credentials')}
          >
            {!isRefreshing && <IconRefreshCw size={16} />}
            {t('quota_management.refresh_all_credentials')}
          </Button>
        </div>
      }
    >
      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : displayFiles.length === 0 ? (
        <EmptyState
          title={t('quota_management.search_empty_title')}
          description={t('quota_management.search_empty_desc')}
        />
      ) : (
        <>
          <div ref={gridRef} className={config.gridClassName}>
            {pageItems.map((item) => {
              const itemQuota = quota[item.name];
              const isResettingQuota = resettingQuotaName === item.name;
              const quotaResetCreditsAvailableCount =
                itemQuota && 'rateLimitResetCreditsAvailableCount' in itemQuota
                  ? itemQuota.rateLimitResetCreditsAvailableCount
                  : null;
              const hasQuotaResetCredits =
                typeof quotaResetCreditsAvailableCount === 'number' &&
                quotaResetCreditsAvailableCount > 0;
              const canRefreshQuota =
                !disabled && !item.disabled && itemQuota?.status !== 'loading' && !isResettingQuota;
              const canResetQuota = canRefreshQuota && hasQuotaResetCredits;
              const showResetQuotaAction =
                itemQuota !== undefined && Boolean(config.canResetQuota?.(itemQuota));
              const resetQuotaAction =
                config.resetQuota && showResetQuotaAction ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={styles.quotaResetCreditButton}
                    onClick={() => resetQuotaForFile(item)}
                    disabled={!canResetQuota}
                    loading={isResettingQuota}
                    title={t('codex_quota.reset_button')}
                    aria-label={t('codex_quota.reset_button')}
                  >
                    {!isResettingQuota && <IconRefreshCw size={14} />}
                    {t('codex_quota.reset_button')}
                  </Button>
                ) : undefined;

              return (
                <QuotaCard
                  key={item.name}
                  item={item}
                  quota={itemQuota}
                  resolvedTheme={resolvedTheme}
                  i18nPrefix={config.i18nPrefix}
                  cardIdleMessageKey={config.cardIdleMessageKey}
                  cardClassName={config.cardClassName}
                  defaultType={config.type}
                  canRefresh={canRefreshQuota}
                  onRefresh={() => void refreshQuotaForFile(item)}
                  resetQuotaAction={resetQuotaAction}
                  renderQuotaItems={config.renderQuotaItems}
                />
              );
            })}
          </div>
          {displayFiles.length > pageSize && effectiveViewMode === 'paged' && (
            <div className={styles.pagination}>
              <Button variant="secondary" size="sm" onClick={goToPrev} disabled={currentPage <= 1}>
                {t('auth_files.pagination_prev')}
              </Button>
              <div className={styles.pageInfo}>
                {t('auth_files.pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: displayFiles.length,
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToNext}
                disabled={currentPage >= totalPages}
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          )}
        </>
      )}
      {showTooManyWarning &&
        (typeof document === 'undefined' ? (
          <QuotaShowAllWarning
            onClose={() => setShowTooManyWarning(false)}
            onConfirmAll={() => {
              setForceShowAll(true);
              setViewMode('all');
              setShowTooManyWarning(false);
            }}
          />
        ) : (
          createPortal(
            <QuotaShowAllWarning
              onClose={() => setShowTooManyWarning(false)}
              onConfirmAll={() => {
                setForceShowAll(true);
                setViewMode('all');
                setShowTooManyWarning(false);
              }}
            />,
            document.body
          )
        ))}
    </Card>
  );
}

interface QuotaShowAllWarningProps {
  onClose: () => void;
  onConfirmAll: () => void;
}

function QuotaShowAllWarning({ onClose, onConfirmAll }: QuotaShowAllWarningProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.warningOverlay} onClick={onClose}>
      <div className={styles.warningModal} onClick={(event) => event.stopPropagation()}>
        <p>{t('auth_files.too_many_files_warning')}</p>
        <div className={styles.warningActions}>
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('common.confirm')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onConfirmAll}>
            {t('auth_files.load_all_anyway')}
          </Button>
        </div>
      </div>
    </div>
  );
}

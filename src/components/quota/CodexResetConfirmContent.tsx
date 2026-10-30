/**
 * Confirmation body for consuming a Codex manual reset credit.
 *
 * Quota states restored from the server-side startup snapshot only carry the
 * available count (from /wham/usage), not the per-credit details. When the
 * details are missing, they are fetched once when the dialog opens and written
 * back into the Codex quota store.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem, CodexRateLimitResetCredit } from '@/types';
import { fetchCodexResetCreditsForFile, formatShanghaiDateTime } from '@/utils/quota';

export type CodexResetConfirmQuota = {
  rateLimitResetCreditsAvailableCount?: number | null;
  rateLimitResetCredits?: CodexRateLimitResetCredit[];
  rateLimitResetCreditsError?: string;
};

export type CodexResetConfirmClassNames = {
  content?: string;
  summary?: string;
  table?: string;
  error?: string;
};

type CodexResetConfirmContentProps = {
  file: AuthFileItem;
  quota: CodexResetConfirmQuota | null | undefined;
  classNames: CodexResetConfirmClassNames;
};

type ResetCreditsView = {
  count: number | null;
  credits: CodexRateLimitResetCredit[];
  error: string;
  loading: boolean;
};

export function CodexResetConfirmContent({ file, quota, classNames }: CodexResetConfirmContentProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<ResetCreditsView>(() => {
    const credits = quota?.rateLimitResetCredits ?? [];
    return {
      count: quota?.rateLimitResetCreditsAvailableCount ?? null,
      credits,
      error: quota?.rateLimitResetCreditsError ?? '',
      loading: credits.length === 0,
    };
  });
  const needsFetch = view.loading;

  useEffect(() => {
    if (!needsFetch) return;
    let active = true;

    void fetchCodexResetCreditsForFile(file, t).then((data) => {
      const countFromDetails = data.credits.length > 0 ? data.credits.length : null;
      useQuotaStore.getState().setCodexQuota((prev) => {
        const current = prev[file.name];
        if (!current || current.status !== 'success') return prev;
        return {
          ...prev,
          [file.name]: {
            ...current,
            rateLimitResetCreditsAvailableCount:
              data.availableCount ??
              countFromDetails ??
              current.rateLimitResetCreditsAvailableCount ??
              null,
            rateLimitResetCredits: data.credits,
            rateLimitResetCreditsError: data.error,
          },
        };
      });
      if (!active) return;
      setView((prev) => ({
        count: data.availableCount ?? countFromDetails ?? prev.count,
        credits: data.credits,
        error: data.error,
        loading: false,
      }));
    });

    return () => {
      active = false;
    };
  }, [file, needsFetch, t]);

  const { count, credits, error, loading } = view;

  return (
    <div className={classNames.content}>
      <p>{t('codex_quota.reset_confirm_message', { key: file.name })}</p>
      {count !== null ? (
        <div className={classNames.summary}>
          <span>{t('codex_quota.reset_credits_label')}</span>
          <strong>{count}</strong>
        </div>
      ) : null}
      {credits.length > 0 ? (
        <table className={classNames.table}>
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
      ) : loading ? (
        <div>{t('codex_quota.reset_credits_loading')}</div>
      ) : error ? (
        <div className={classNames.error}>
          {t('codex_quota.reset_credits_expiry_failed', { message: error })}
        </div>
      ) : null}
    </div>
  );
}

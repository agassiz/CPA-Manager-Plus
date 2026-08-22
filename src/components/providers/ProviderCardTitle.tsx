import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '@/features/aiProviders/AiProvidersPage.module.scss';

interface ProviderCardTitleProps {
  title: ReactNode;
  selection?: ReactNode;
  disabled?: boolean;
  success: number;
  failure: number;
}

export function ProviderCardTitle({
  title,
  selection,
  disabled = false,
  success,
  failure,
}: ProviderCardTitleProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.providerCardTitleRow}>
      {selection ? <div className={styles.providerCardSelection}>{selection}</div> : null}
      <div className={styles.providerCardTitle}>{title}</div>
      {disabled ? (
        <span className="status-badge warning">{t('ai_providers.config_disabled_badge')}</span>
      ) : null}
      <div className={styles.cardStats}>
        <span className={`${styles.statPill} ${styles.statSuccess}`}>
          {t('stats.success')}: {success}
        </span>
        <span className={`${styles.statPill} ${styles.statFailure}`}>
          {t('stats.failure')}: {failure}
        </span>
      </div>
    </div>
  );
}

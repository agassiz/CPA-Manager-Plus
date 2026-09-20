import type { TFunction } from 'i18next';
import { formatUnixTimestamp } from '@/utils/format';
import type { CodexTurnStateMonitorEntry } from '@/services/api/codexTurnStateMonitor';
import { Button } from '@/components/ui/Button';
import styles from './CodexTurnStateMonitorPanel.module.scss';

type CodexTurnStateMonitorPanelProps = {
  entries: CodexTurnStateMonitorEntry[];
  locale: string;
  t: TFunction;
  onClear: () => void;
  clearing: boolean;
};

export function CodexTurnStateMonitorPanel({
  entries,
  locale,
  t,
  onClear,
  clearing,
}: CodexTurnStateMonitorPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="codex-turn-state-monitor-title">
      <div className={styles.header}>
        <div>
          <h2 id="codex-turn-state-monitor-title" className={styles.title}>
            {t('monitoring.codex_turn_state_monitor_title')}
          </h2>
          <p className={styles.subtitle}>{t('monitoring.codex_turn_state_monitor_hint')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="danger"
            size="xs"
            onClick={onClear}
            loading={clearing}
          >
            {t('monitoring.codex_turn_state_monitor_clear')}
          </Button>
          <span className={styles.count}>{entries.length}</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>{t('monitoring.codex_turn_state_monitor_empty')}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('monitoring.column_time')}</th>
                <th>{t('monitoring.account_label')}</th>
                <th>{t('monitoring.codex_turn_state_monitor_proxy')}</th>
                <th>{t('monitoring.column_status')}</th>
                <th>{t('monitoring.column_codex_turn_state_length')}</th>
                <th>{t('monitoring.codex_turn_state_monitor_result')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.timestamp_ms}-${entry.auth_id ?? 'unknown'}-${index}`}>
                  <td className={styles.muted}>{formatUnixTimestamp(entry.timestamp_ms, locale)}</td>
                  <td>{entry.auth_label || entry.auth_id || '-'}</td>
                  <td className={styles.proxy}>{entry.proxy || '-'}</td>
                  <td>{entry.status || '-'}</td>
                  <td>{entry.state_length || '-'}</td>
                  <td>
                    <span className={entry.success ? styles.success : styles.failure}>
                      {entry.success
                        ? t('monitoring.codex_turn_state_monitor_success')
                        : t('monitoring.codex_turn_state_monitor_failed')}
                    </span>
                    {entry.error ? <div className={styles.error}>{entry.error}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

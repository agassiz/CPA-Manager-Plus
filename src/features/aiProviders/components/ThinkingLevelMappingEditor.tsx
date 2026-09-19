import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus, IconX } from '@/components/ui/icons';
import {
  hasDuplicateMappingSources,
  parseThinkingConfig,
  serializeThinkingLevelMapping,
  THINKING_REASONING_LEVELS,
  type ThinkingLevelMappingRow,
} from './thinkingLevelMapping';
import styles from './ThinkingLevelMappingEditor.module.scss';

interface ThinkingLevelMappingEditorProps {
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

const emptyRow = (): ThinkingLevelMappingRow => ({ from: '', to: '' });

export function ThinkingLevelMappingEditor({
  value,
  disabled,
  onChange,
}: ThinkingLevelMappingEditorProps) {
  const { t } = useTranslation();
  const parsed = parseThinkingConfig(value);
  const [rows, setRows] = useState<ThinkingLevelMappingRow[]>(parsed.rows);

  useEffect(() => {
    if (!parsed.error) setRows(parsed.rows);
  }, [parsed.error, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRows = (nextRows: ThinkingLevelMappingRow[]) => {
    setRows(nextRows);
    if (
      parsed.error ||
      hasDuplicateMappingSources(nextRows) ||
      nextRows.some((row) => !row.from.trim() || !row.to.trim())
    ) {
      return;
    }
    onChange(serializeThinkingLevelMapping(parsed.config, nextRows));
  };

  const levelOptions = [
    { value: '', label: t('providersPage.form.thinkingLevelPlaceholder') },
    ...THINKING_REASONING_LEVELS.map((level) => ({ value: level, label: level })),
  ];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>{t('providersPage.form.thinkingLevelMapping')}</span>
        <small className={styles.hint}>{t('providersPage.form.thinkingLevelMappingHint')}</small>
      </div>
      {parsed.error ? <div className={styles.error}>{parsed.error}</div> : null}
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <select
            className={styles.select}
            value={row.from}
            disabled={disabled || Boolean(parsed.error)}
            aria-label={t('providersPage.form.thinkingLevelMappingSource')}
            onChange={(event) =>
              updateRows(rows.map((item, itemIndex) =>
                itemIndex === index ? { ...item, from: event.target.value } : item
              ))
            }
          >
            {levelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <select
            className={styles.select}
            value={row.to}
            disabled={disabled || Boolean(parsed.error)}
            aria-label={t('providersPage.form.thinkingLevelMappingTarget')}
            onChange={(event) =>
              updateRows(rows.map((item, itemIndex) =>
                itemIndex === index ? { ...item, to: event.target.value } : item
              ))
            }
          >
            {levelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.removeButton}
            disabled={disabled || Boolean(parsed.error)}
            onClick={() => updateRows(rows.filter((_, rowIndex) => rowIndex !== index))}
            aria-label={t('providersPage.form.removeThinkingLevelMapping')}
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
      {hasDuplicateMappingSources(rows) ? (
        <div className={styles.error}>{t('providersPage.form.thinkingLevelMappingDuplicate')}</div>
      ) : null}
      <button
        type="button"
        className={styles.addButton}
        disabled={disabled || Boolean(parsed.error)}
        onClick={() => updateRows([...rows, emptyRow()])}
      >
        <IconPlus size={12} />
        <span>{t('providersPage.form.addThinkingLevelMapping')}</span>
      </button>
    </div>
  );
}

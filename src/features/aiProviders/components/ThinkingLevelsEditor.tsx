import { useTranslation } from 'react-i18next';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { THINKING_LEVELS, readThinkingLevels, type ThinkingLevel } from './thinkingLevels';
import styles from './ThinkingLevelsEditor.module.scss';

interface ThinkingLevelsEditorProps {
  thinking?: Record<string, unknown>;
  disabled: boolean;
  onChange: (levels: ThinkingLevel[]) => void;
}

export function ThinkingLevelsEditor({ thinking, disabled, onChange }: ThinkingLevelsEditorProps) {
  const { t } = useTranslation();
  const selected = readThinkingLevels(thinking);

  const toggle = (level: ThinkingLevel) => {
    onChange(
      selected.includes(level)
        ? selected.filter((item) => item !== level)
        : THINKING_LEVELS.filter((item) => item === level || selected.includes(item))
    );
  };

  return (
    <fieldset className={styles.root}>
      <legend className={styles.label}>{t('providersPage.form.thinkingLevelsAllowed')}</legend>
      <small className={styles.hint}>{t('providersPage.form.thinkingLevelsAllowedHint')}</small>
      <div className={styles.grid}>
        {THINKING_LEVELS.map((level) => (
          <SelectionCheckbox
            key={level}
            checked={selected.includes(level)}
            disabled={disabled}
            onChange={() => toggle(level)}
            className={[styles.option, selected.includes(level) ? styles.optionSelected : '']
              .filter(Boolean)
              .join(' ')}
            labelClassName={styles.optionLabel}
            label={
              <>
                <span>{t(`providersPage.form.thinkingLevels.${level}`)}</span>
                <code>{level}</code>
              </>
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

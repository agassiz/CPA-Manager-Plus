import { useTranslation } from 'react-i18next';
import type { ModelEntryOptions } from '@/components/ui/modelInputListUtils';
import styles from './ModelOptionsEditor.module.scss';

const MODALITIES = ['text', 'image'] as const;

interface ModelOptionsEditorProps {
  value: ModelEntryOptions;
  disabled: boolean;
  onChange: (patch: Partial<ModelEntryOptions>) => void;
}

const toggleModality = (current: string[] | undefined, modality: string, checked: boolean) => {
  const rest = (current ?? []).filter((item) => item !== modality);
  return checked ? [...rest, modality] : rest;
};

export function ModelOptionsEditor({ value, disabled, onChange }: ModelOptionsEditorProps) {
  const { t } = useTranslation();

  const renderModalities = (
    label: string,
    current: string[] | undefined,
    field: 'inputModalities' | 'outputModalities'
  ) => (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.modalities}>
        {MODALITIES.map((modality) => (
          <label key={modality} className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={current?.includes(modality) === true}
              disabled={disabled}
              onChange={(e) => onChange({ [field]: toggleModality(current, modality, e.target.checked) })}
            />
            <span className={styles.checkboxText}>{modality}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={value.image === true}
          disabled={disabled}
          onChange={(e) => onChange({ image: e.target.checked })}
        />
        <span className={styles.checkboxText}>
          <span>{t('providersPage.form.modelImage')}</span>
          <small>{t('providersPage.form.modelImageHint')}</small>
        </span>
      </label>
      {renderModalities(
        t('providersPage.form.modelInputModalities'),
        value.inputModalities,
        'inputModalities'
      )}
      {renderModalities(
        t('providersPage.form.modelOutputModalities'),
        value.outputModalities,
        'outputModalities'
      )}
      <div className={styles.field}>
        <label className={styles.label}>{t('providersPage.form.modelMaxContextLength')}</label>
        <input
          type="number"
          min={1}
          className={styles.input}
          value={value.maxContextLength ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const parsed = Math.trunc(Number(e.target.value));
            onChange({ maxContextLength: parsed > 0 ? parsed : undefined });
          }}
        />
        <small className={styles.hint}>{t('providersPage.form.modelMaxContextLengthHint')}</small>
      </div>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={value.useMaxCompletionTokens === true}
          disabled={disabled}
          onChange={(e) => onChange({ useMaxCompletionTokens: e.target.checked })}
        />
        <span className={styles.checkboxText}>
          <span>{t('providersPage.form.modelUseMaxCompletionTokens')}</span>
          <small>{t('providersPage.form.modelUseMaxCompletionTokensHint')}</small>
        </span>
      </label>
    </div>
  );
}

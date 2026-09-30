import { useTranslation } from 'react-i18next';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
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

const cardClassName = (checked: boolean) =>
  [styles.card, checked ? styles.cardSelected : ''].filter(Boolean).join(' ');

export function ModelOptionsEditor({ value, disabled, onChange }: ModelOptionsEditorProps) {
  const { t } = useTranslation();

  const renderModalities = (
    label: string,
    current: string[] | undefined,
    field: 'inputModalities' | 'outputModalities'
  ) => (
    <fieldset className={styles.group}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.chips}>
        {MODALITIES.map((modality) => {
          const checked = current?.includes(modality) === true;
          return (
            <SelectionCheckbox
              key={modality}
              checked={checked}
              disabled={disabled}
              onChange={(next) => onChange({ [field]: toggleModality(current, modality, next) })}
              className={`${cardClassName(checked)} ${styles.chip}`}
              labelClassName={styles.cardTitle}
              label={modality}
            />
          );
        })}
      </div>
    </fieldset>
  );

  const imageChecked = value.image === true;
  const maxTokensChecked = value.useMaxCompletionTokens === true;

  // An image-endpoint model is only served through /v1/images/*, so chat options do not apply.
  if (imageChecked) {
    return (
      <div className={styles.root}>
        <SelectionCheckbox
          checked
          disabled={disabled}
          onChange={(next) => onChange({ image: next })}
          className={cardClassName(true)}
          labelClassName={styles.cardText}
          label={
            <>
              <span className={styles.cardTitle}>{t('providersPage.form.modelImage')}</span>
              <small className={styles.hint}>{t('providersPage.form.modelImageHint')}</small>
            </>
          }
        />
        <small className={styles.hint}>{t('providersPage.form.modelImageOnlyHint')}</small>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.cardGrid}>
        <SelectionCheckbox
          checked={imageChecked}
          disabled={disabled}
          onChange={(next) => onChange({ image: next })}
          className={cardClassName(imageChecked)}
          labelClassName={styles.cardText}
          label={
            <>
              <span className={styles.cardTitle}>{t('providersPage.form.modelImage')}</span>
              <small className={styles.hint}>{t('providersPage.form.modelImageHint')}</small>
            </>
          }
        />
        <SelectionCheckbox
          checked={maxTokensChecked}
          disabled={disabled}
          onChange={(next) => onChange({ useMaxCompletionTokens: next })}
          className={cardClassName(maxTokensChecked)}
          labelClassName={styles.cardText}
          label={
            <>
              <span className={styles.cardTitle}>
                {t('providersPage.form.modelUseMaxCompletionTokens')}
              </span>
              <small className={styles.hint}>
                {t('providersPage.form.modelUseMaxCompletionTokensHint')}
              </small>
            </>
          }
        />
      </div>
      <div className={styles.modalityGrid}>
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
      </div>
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
    </div>
  );
}

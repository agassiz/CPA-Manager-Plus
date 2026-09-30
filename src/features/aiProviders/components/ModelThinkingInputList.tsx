import { useTranslation } from 'react-i18next';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import styles from '../AiProvidersPage.module.scss';
import { ThinkingLevelsEditor } from './ThinkingLevelsEditor';
import { applyThinkingLevels } from './thinkingLevels';

interface ModelThinkingInputListProps {
  entries: ModelEntry[];
  onChange: (entries: ModelEntry[]) => void;
  disabled: boolean;
}

/** Model name/alias rows whose allowed thinking levels open behind a per-row expander. */
export function ModelThinkingInputList({ entries, onChange, disabled }: ModelThinkingInputListProps) {
  const { t } = useTranslation();
  return (
    <ModelInputList
      entries={entries}
      onChange={onChange}
      namePlaceholder={t('common.model_name_placeholder')}
      aliasPlaceholder={t('common.model_alias_placeholder')}
      disabled={disabled}
      hideAddButton
      className={styles.modelInputList}
      rowClassName={`${styles.modelInputRow} ${styles.modelInputRowCollapsible}`}
      inputClassName={styles.modelInputField}
      removeButtonClassName={styles.modelRowRemoveButton}
      removeButtonTitle={t('common.delete')}
      removeButtonAriaLabel={t('common.delete')}
      collapsibleDetails
      expandLabel={t('common.expand')}
      collapseLabel={t('common.collapse')}
      entryDetailsClassName={styles.modelThinkingMapping}
      renderEntryDetails={(entry, index) =>
        entry.name.trim() ? (
          <ThinkingLevelsEditor
            thinking={entry.thinking}
            disabled={disabled}
            onChange={(levels) =>
              onChange(
                entries.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, thinking: applyThinkingLevels(candidate.thinking, levels) }
                    : candidate
                )
              )
            }
          />
        ) : null
      }
    />
  );
}

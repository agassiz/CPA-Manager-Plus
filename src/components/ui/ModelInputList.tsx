import { Fragment, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { IconChevronDown, IconX } from './icons';
import type { ModelEntry } from './modelInputListUtils';

interface ModelInputListProps {
  entries: ModelEntry[];
  onChange: (entries: ModelEntry[]) => void;
  addLabel?: string;
  disabled?: boolean;
  namePlaceholder?: string;
  aliasPlaceholder?: string;
  hideAddButton?: boolean;
  onAdd?: () => void;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  removeButtonClassName?: string;
  removeButtonTitle?: string;
  removeButtonAriaLabel?: string;
  renderEntryDetails?: (entry: ModelEntry, index: number) => ReactNode;
  entryDetailsClassName?: string;
  /** Show entry details only for the row whose chevron button was clicked. */
  collapsibleDetails?: boolean;
  toggleButtonClassName?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

export function ModelInputList({
  entries,
  onChange,
  addLabel,
  disabled = false,
  namePlaceholder = 'model-name',
  aliasPlaceholder = 'alias (optional)',
  hideAddButton = false,
  onAdd,
  className = '',
  rowClassName = '',
  inputClassName = '',
  removeButtonClassName = '',
  removeButtonTitle = 'Remove',
  removeButtonAriaLabel = 'Remove',
  renderEntryDetails,
  entryDetailsClassName = '',
  collapsibleDetails = false,
  toggleButtonClassName = '',
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
}: ModelInputListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const currentEntries = entries.length ? entries : [{ name: '', alias: '' }];
  const containerClassName = ['header-input-list', className].filter(Boolean).join(' ');
  const inputClassNames = ['input', inputClassName].filter(Boolean).join(' ');
  const rowClassNames = ['header-input-row', rowClassName].filter(Boolean).join(' ');

  const updateEntry = (index: number, field: 'name' | 'alias', value: string) => {
    const next = currentEntries.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry));
    onChange(next);
  };

  const addEntry = () => {
    if (onAdd) {
      onAdd();
    } else {
      onChange([...currentEntries, { name: '', alias: '' }]);
    }
  };

  const removeEntry = (index: number) => {
    setExpandedIndex((prev) => {
      if (prev === null || prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
    const next = currentEntries.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [{ name: '', alias: '' }]);
  };

  return (
    <div className={containerClassName}>
      {currentEntries.map((entry, index) => {
        const details = renderEntryDetails?.(entry, index);
        const expanded = collapsibleDetails && expandedIndex === index;
        const toggleLabel = expanded ? collapseLabel : expandLabel;
        return (
          <Fragment key={index}>
            <div className={rowClassNames}>
              <input
                className={inputClassNames}
                placeholder={namePlaceholder}
                value={entry.name}
                onChange={(e) => updateEntry(index, 'name', e.target.value)}
                disabled={disabled}
              />
              <span className="header-separator">→</span>
              <input
                className={inputClassNames}
                placeholder={aliasPlaceholder}
                value={entry.alias}
                onChange={(e) => updateEntry(index, 'alias', e.target.value)}
                disabled={disabled}
              />
              {collapsibleDetails && details ? (
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  onClick={() => setExpandedIndex(expanded ? null : index)}
                  className={toggleButtonClassName}
                  title={toggleLabel}
                  aria-label={toggleLabel}
                  aria-expanded={expanded}
                >
                  <IconChevronDown
                    size={14}
                    style={{
                      transition: 'transform 0.15s ease',
                      transform: expanded ? 'rotate(180deg)' : undefined,
                    }}
                  />
                </Button>
              ) : collapsibleDetails ? (
                <span aria-hidden="true" />
              ) : null}
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onClick={() => removeEntry(index)}
                disabled={disabled || currentEntries.length <= 1}
                className={removeButtonClassName}
                title={removeButtonTitle}
                aria-label={removeButtonAriaLabel}
              >
                <IconX size={14} />
              </Button>
            </div>
            {details && (!collapsibleDetails || expanded) ? (
              <div className={entryDetailsClassName}>{details}</div>
            ) : null}
          </Fragment>
        );
      })}
      {!hideAddButton && addLabel && (
        <Button variant="secondary" size="xs" onClick={addEntry} disabled={disabled} className="align-start">
          {addLabel}
        </Button>
      )}
    </div>
  );
}

import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPencil, IconTrash2 } from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { StatusBarData } from '@/utils/recentRequests';
import styles from './AiProvidersPage.module.scss';

export type AiProviderListRow = {
  id: string;
  provider: string;
  providerClassName?: string;
  name: string;
  baseUrl: string;
  credential: string;
  credentialDetails?: string[];
  modelCount: number | null;
  modelDetails?: string[];
  filterModels?: string[];
  searchValues?: string[];
  priority?: number;
  statusLabel?: string;
  success: number;
  failure: number;
  authIndices?: string[];
  statusData: StatusBarData;
  disabled: boolean;
  canToggle: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle?: (enabled: boolean) => void;
};

type AiProvidersUnifiedTableProps = {
  rows: AiProviderListRow[];
  loading: boolean;
  actionsDisabled: boolean;
  selectedRowIds: ReadonlySet<string>;
  onSelectedRowIdsChange: (next: Set<string>) => void;
};

type HoverDetailsProps = {
  label: string;
  value: ReactNode;
  details: string[];
};

function HoverDetails({ label, value, details }: HoverDetailsProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  if (details.length === 0) return <>{value}</>;

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tooltipWidth = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = Math.min(280, 52 + details.length * 26);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - tooltipWidth - 12)
    );
    const belowTop = rect.bottom + 8;
    const top =
      belowTop + estimatedHeight <= window.innerHeight - 12
        ? belowTop
        : Math.max(12, rect.top - estimatedHeight - 8);

    setPosition({ top, left });
  };

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.unifiedProviderHoverValue}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        {value}
      </span>
      {open
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={styles.unifiedProviderHoverPopover}
              style={{ top: position.top, left: position.left }}
            >
              <div className={styles.unifiedProviderHoverPopoverTitle}>{label}</div>
              <ul className={styles.unifiedProviderHoverPopoverList}>
                {details.map((detail, index) => (
                  <li key={`${detail}-${index}`}>{detail}</li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function AiProvidersUnifiedTable({
  rows,
  loading,
  actionsDisabled,
  selectedRowIds,
  onSelectedRowIdsChange,
}: AiProvidersUnifiedTableProps) {
  const { t } = useTranslation();
  const displayRows = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => Number(left.row.disabled) - Number(right.row.disabled) || left.index - right.index)
    .map(({ row }) => row);
  const selectableRows = displayRows.filter((row) => (row.authIndices?.length ?? 0) > 0);
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedRowIds.has(row.id));

  const toggleRow = (id: string, selected: boolean) => {
    const next = new Set(selectedRowIds);
    if (selected) next.add(id);
    else next.delete(id);
    onSelectedRowIdsChange(next);
  };

  const toggleAll = (selected: boolean) => {
    const next = new Set(selectedRowIds);
    selectableRows.forEach((row) => {
      if (selected) next.add(row.id);
      else next.delete(row.id);
    });
    onSelectedRowIdsChange(next);
  };

  if (loading && rows.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (rows.length === 0) {
    return <div className={styles.unifiedProviderEmpty}>{t('ai_providers.unified_empty')}</div>;
  }

  return (
    <div className={styles.unifiedProviderTableWrapper}>
      <table className={styles.unifiedProviderTable}>
        <thead>
          <tr>
            <th className={styles.unifiedProviderSelectionCell}>
              <SelectionCheckbox
                checked={allSelectableSelected}
                onChange={toggleAll}
                ariaLabel={t('ai_providers.counter_snapshot_select_all')}
                disabled={selectableRows.length === 0}
              />
            </th>
            <th>{t('ai_providers.unified_provider')}</th>
            <th>{t('ai_providers.unified_name')}</th>
            <th>{t('ai_providers.unified_base_url')}</th>
            <th>{t('ai_providers.unified_credential')}</th>
            <th>{t('ai_providers.unified_models')}</th>
            <th>{t('ai_providers.unified_usage')}</th>
            <th>{t('ai_providers.unified_health')}</th>
            <th>{t('ai_providers.unified_status')}</th>
            <th className={styles.unifiedProviderActionsCell}>{t('ai_providers.unified_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr key={row.id} className={row.disabled ? styles.unifiedProviderRowDisabled : ''}>
              <td className={styles.unifiedProviderSelectionCell}>
                <SelectionCheckbox
                  checked={selectedRowIds.has(row.id)}
                  onChange={(selected) => toggleRow(row.id, selected)}
                  ariaLabel={t('ai_providers.counter_snapshot_select_row', { name: row.name })}
                  disabled={(row.authIndices?.length ?? 0) === 0}
                />
              </td>
              <td>
                <span className={`${styles.unifiedProviderBadge} ${row.providerClassName ?? ''}`}>
                  {row.provider}
                </span>
              </td>
              <td className={styles.unifiedProviderNameCell} title={row.name}>
                {row.name}
              </td>
              <td className={styles.unifiedProviderUrlCell} title={row.baseUrl}>
                {row.baseUrl || '-'}
              </td>
              <td className={styles.unifiedProviderCredentialCell}>
                <HoverDetails
                  label={t('ai_providers.unified_credential')}
                  value={row.credential || '-'}
                  details={row.credentialDetails ?? []}
                />
              </td>
              <td className={styles.unifiedProviderNumberCell}>
                <HoverDetails
                  label={t('ai_providers.unified_models')}
                  value={row.modelCount === null ? '-' : row.modelCount}
                  details={row.modelDetails ?? []}
                />
              </td>
              <td className={styles.unifiedProviderUsageCell}>
                <span className={styles.unifiedProviderSuccess}>{row.success}</span>
                <span>/</span>
                <span className={styles.unifiedProviderFailure}>{row.failure}</span>
              </td>
              <td className={styles.unifiedProviderHealthCell}>
                <ProviderStatusBar statusData={row.statusData} styles={styles} />
              </td>
              <td>
                <span
                  className={`${styles.unifiedProviderStatusBadge} ${
                    row.disabled
                      ? styles.unifiedProviderStatusDisabled
                      : styles.unifiedProviderStatusEnabled
                  }`}
                >
                  {row.statusLabel ??
                    (row.disabled
                      ? t('ai_providers.unified_disabled')
                      : t('ai_providers.unified_enabled'))}
                </span>
              </td>
              <td className={styles.unifiedProviderActionsCell}>
                <div className={styles.unifiedProviderActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={row.onEdit}
                    disabled={actionsDisabled}
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                  >
                    <IconPencil size={15} />
                  </Button>
                  {row.canDelete ? (
                    <Button
                      variant="danger"
                      size="sm"
                      iconOnly
                      onClick={row.onDelete}
                      disabled={actionsDisabled}
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <IconTrash2 size={15} />
                    </Button>
                  ) : null}
                  {row.canToggle && row.onToggle ? (
                    <ToggleSwitch
                      ariaLabel={t('ai_providers.config_toggle_label')}
                      checked={!row.disabled}
                      disabled={actionsDisabled}
                      onChange={row.onToggle}
                    />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

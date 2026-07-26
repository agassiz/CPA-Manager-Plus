import type { ProviderSortBy, SortDir } from '@/features/providers/types';
import type { AiProviderListRow } from './AiProvidersUnifiedTable';

export interface AiProviderListControls {
  filter: string;
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  selectedModels: ReadonlySet<string>;
}

const normalizeSearchValue = (value: unknown): string => String(value ?? '').toLowerCase();

const matchesSearch = (row: AiProviderListRow, filter: string): boolean => {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return true;

  return [
    row.provider,
    row.name,
    row.baseUrl,
    row.credential,
    ...(row.credentialDetails ?? []),
    ...(row.modelDetails ?? []),
    ...(row.searchValues ?? []),
  ].some((value) => normalizeSearchValue(value).includes(normalized));
};

const matchesSelectedModels = (
  row: AiProviderListRow,
  selectedModels: ReadonlySet<string>
): boolean =>
  selectedModels.size === 0 ||
  (row.filterModels ?? []).some((model) => selectedModels.has(model));

export const getAvailableAiProviderModels = (rows: AiProviderListRow[]): string[] =>
  Array.from(new Set(rows.flatMap((row) => row.filterModels ?? []))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  );

export const filterAndSortAiProviderRows = (
  rows: AiProviderListRow[],
  controls: AiProviderListControls
): AiProviderListRow[] => {
  const direction = controls.sortDir === 'asc' ? 1 : -1;

  return rows
    .filter(
      (row) =>
        matchesSearch(row, controls.filter) &&
        matchesSelectedModels(row, controls.selectedModels)
    )
    .sort((left, right) => {
      const primaryDiff =
        controls.sortBy === 'name'
          ? left.name.localeCompare(right.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          : controls.sortBy === 'priority'
            ? (left.priority ?? 0) - (right.priority ?? 0)
            : left.statusData.totalSuccess - right.statusData.totalSuccess;
      const fallbackDiff =
        left.provider.localeCompare(right.provider, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) || left.id.localeCompare(right.id);

      return (primaryDiff || fallbackDiff) * direction;
    });
};

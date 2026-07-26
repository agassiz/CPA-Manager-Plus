import { describe, expect, it } from 'vitest';
import type { AiProviderListRow } from './AiProvidersUnifiedTable';
import {
  filterAndSortAiProviderRows,
  getAvailableAiProviderModels,
} from './aiProviderListControls';

const buildRow = (
  id: string,
  overrides: Partial<AiProviderListRow> = {}
): AiProviderListRow => ({
  id,
  provider: 'Provider',
  name: id,
  baseUrl: '',
  credential: '',
  modelCount: 0,
  success: 0,
  failure: 0,
  statusData: {
    blocks: [],
    blockDetails: [],
    successRate: 0,
    totalSuccess: 0,
    totalFailure: 0,
  },
  disabled: false,
  canToggle: false,
  canDelete: false,
  onEdit: () => undefined,
  onDelete: () => undefined,
  ...overrides,
});

describe('AI provider list controls', () => {
  it('searches visible and provider metadata fields', () => {
    const rows = [
      buildRow('codex', { searchValues: ['auth-index-12'] }),
      buildRow('claude'),
    ];

    expect(
      filterAndSortAiProviderRows(rows, {
        filter: 'AUTH-INDEX-12',
        sortBy: 'name',
        sortDir: 'asc',
        selectedModels: new Set(),
      }).map((row) => row.id)
    ).toEqual(['codex']);
  });

  it('filters by any selected model and exposes unique model options', () => {
    const rows = [
      buildRow('one', { filterModels: ['gpt-5', 'claude-sonnet'] }),
      buildRow('two', { filterModels: ['gpt-5'] }),
      buildRow('three'),
    ];

    expect(getAvailableAiProviderModels(rows)).toEqual(['claude-sonnet', 'gpt-5']);
    expect(
      filterAndSortAiProviderRows(rows, {
        filter: '',
        sortBy: 'name',
        sortDir: 'asc',
        selectedModels: new Set(['claude-sonnet']),
      }).map((row) => row.id)
    ).toEqual(['one']);
  });

  it('sorts by priority and recent success in either direction', () => {
    const rows = [
      buildRow('low', { priority: 1, statusData: { ...buildRow('x').statusData, totalSuccess: 2 } }),
      buildRow('high', {
        priority: 9,
        statusData: { ...buildRow('x').statusData, totalSuccess: 12 },
      }),
    ];

    expect(
      filterAndSortAiProviderRows(rows, {
        filter: '',
        sortBy: 'priority',
        sortDir: 'desc',
        selectedModels: new Set(),
      }).map((row) => row.id)
    ).toEqual(['high', 'low']);
    expect(
      filterAndSortAiProviderRows(rows, {
        filter: '',
        sortBy: 'recent-success',
        sortDir: 'asc',
        selectedModels: new Set(),
      }).map((row) => row.id)
    ).toEqual(['low', 'high']);
  });
});

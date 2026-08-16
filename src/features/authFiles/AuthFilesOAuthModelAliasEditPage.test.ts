import { describe, expect, it } from 'vitest';
import { buildSourceModelOptions } from './AuthFilesOAuthModelAliasEditPage';

const models = [
  { id: 'model-a', display_name: 'Model A' },
  { id: 'model-b', display_name: 'Model B' },
];

describe('OAuth model alias source model options', () => {
  it('keeps source model names unique by default', () => {
    const mappings = [{ name: 'model-a' }, { name: '' }];

    expect(buildSourceModelOptions(models, mappings, 1, false)).toEqual([
      { value: 'model-b', label: 'Model B' },
    ]);
  });

  it('keeps the current row source model available in unique mode', () => {
    const mappings = [{ name: 'model-a' }, { name: 'model-b' }];

    expect(buildSourceModelOptions(models, mappings, 0, false)).toEqual([
      { value: 'model-a', label: 'Model A' },
    ]);
  });

  it('allows a mapped source model missing from the catalog to be reused', () => {
    const mappings = [{ name: 'model-d' }, { name: '' }];

    expect(buildSourceModelOptions(models, mappings, 1, true)).toEqual([
      { value: 'model-a', label: 'Model A' },
      { value: 'model-b', label: 'Model B' },
      { value: 'model-d' },
    ]);
  });

  it('restores persisted provider source models to duplicate-name choices', () => {
    const mappings = [{ name: '' }];
    const persistedMappings = [{ name: 'model-d' }];

    expect(buildSourceModelOptions(models, mappings, 0, true, persistedMappings)).toEqual([
      { value: 'model-a', label: 'Model A' },
      { value: 'model-b', label: 'Model B' },
      { value: 'model-d' },
    ]);
  });

  it('restores a source model immediately when switching from unique to duplicate mode', () => {
    const mappings = [{ name: 'model-a' }, { name: '' }];

    expect(buildSourceModelOptions(models, mappings, 1, false)).toEqual([
      { value: 'model-b', label: 'Model B' },
    ]);
    expect(buildSourceModelOptions(models, mappings, 1, true)).toEqual([
      { value: 'model-a', label: 'Model A' },
      { value: 'model-b', label: 'Model B' },
    ]);
  });
});

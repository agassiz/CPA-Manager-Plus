import type { ModelAlias } from '@/types';

export type ModelEntryOptions = Pick<
  ModelAlias,
  'image' | 'maxContextLength' | 'inputModalities' | 'outputModalities' | 'useMaxCompletionTokens'
>;

export interface ModelEntry extends ModelEntryOptions {
  name: string;
  alias: string;
  thinking?: Record<string, unknown>;
}

/** Keeps only the option fields that carry a value, so empty options are not persisted. */
export const compactModelOptions = (entry: ModelEntryOptions): ModelEntryOptions => {
  const options: ModelEntryOptions = {};
  if (entry.image) options.image = true;
  if (entry.maxContextLength && entry.maxContextLength > 0) {
    options.maxContextLength = entry.maxContextLength;
  }
  if (entry.inputModalities?.length) options.inputModalities = entry.inputModalities;
  if (entry.outputModalities?.length) options.outputModalities = entry.outputModalities;
  if (entry.useMaxCompletionTokens) options.useMaxCompletionTokens = true;
  return options;
};

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => ({
    name: model.name || '',
    alias: model.alias || '',
    thinking: model.thinking,
    ...compactModelOptions(model),
  }));
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { name: entry.name.trim(), ...compactModelOptions(entry) };
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      if (entry.thinking && Object.keys(entry.thinking).length > 0) {
        model.thinking = entry.thinking;
      }
      return model;
    });
};

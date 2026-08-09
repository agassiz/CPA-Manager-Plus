/**
 * AI 提供商相关 API
 */

import { apiClient } from './client';
import {
  normalizeGeminiKeyConfig,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig
} from './transformers';
import type {
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  ApiKeyEntry,
  ModelAlias
} from '@/types';

const serializeHeaders = (headers?: Record<string, string>) => (headers && Object.keys(headers).length ? headers : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Legacy configuration responses could contain runtime auth indexes. Treat them
// as known fields solely so saves remove them instead of preserving stale values.
const AUTH_INDEX_FIELDS = ['auth-index', 'authIndex', 'auth_index'] as const;

const PROVIDER_KEY_FIELDS = [
  'name',
  'api-key',
  'apiKey',
  ...AUTH_INDEX_FIELDS,
  'priority',
  'prefix',
  'base-url',
  'baseUrl',
  'base_url',
  'websockets',
  'proxy-url',
  'proxyUrl',
  'proxy_url',
  'headers',
  'models',
  'excluded-models',
  'excludedModels',
  'excluded_models',
  'disable-cooling',
  'disableCooling',
  'disable_cooling',
  'cloak',
  'experimental-cch-signing',
  'experimentalCCHSigning',
  'experimental_cch_signing',
] as const;

const GEMINI_KEY_FIELDS = PROVIDER_KEY_FIELDS.filter(
  (field) => field !== 'websockets' && field !== 'cloak'
);
const VERTEX_KEY_FIELDS = GEMINI_KEY_FIELDS;

const OPENAI_PROVIDER_FIELDS = [
  'name',
  'priority',
  'disabled',
  'prefix',
  'base-url',
  'baseUrl',
  'base_url',
  'api-key-entries',
  'apiKeyEntries',
  'api_key_entries',
  'api-keys',
  'apiKeys',
  'api_keys',
  ...AUTH_INDEX_FIELDS,
  'headers',
  'chat-completions-only',
  'chatCompletionsOnly',
  'chat_completions_only',
  'models',
  'test-model',
  'testModel',
  'test_model',
  'disable-cooling',
  'disableCooling',
  'disable_cooling',
] as const;

const MODEL_ALIAS_FIELDS = [
  'name',
  'id',
  'model',
  'alias',
  'display_name',
  'displayName',
  'priority',
  'test-model',
  'testModel',
  'test_model',
  'image',
  'thinking',
] as const;

const API_KEY_ENTRY_FIELDS = [
  'api-key',
  'apiKey',
  'key',
  ...AUTH_INDEX_FIELDS,
  'proxy-url',
  'proxyUrl',
  'proxy_url',
  'headers',
] as const;

const CLOAK_FIELDS = [
  'mode',
  'strict-mode',
  'strictMode',
  'strict_mode',
  'sensitive-words',
  'sensitiveWords',
  'sensitive_words',
  'cache-user-id',
  'cacheUserID',
  'cache_user_id',
] as const;

const RAW_SECTION_ALIASES: Record<string, readonly string[]> = {
  'gemini-api-key': ['gemini-api-key', 'geminiApiKey', 'geminiApiKeys'],
  'codex-api-key': ['codex-api-key', 'codexApiKey', 'codexApiKeys'],
  'xai-api-key': ['xai-api-key', 'xaiApiKey', 'xaiApiKeys'],
  'claude-api-key': ['claude-api-key', 'claudeApiKey', 'claudeApiKeys'],
  'vertex-api-key': ['vertex-api-key', 'vertexApiKey', 'vertexApiKeys'],
  'openai-compatibility': ['openai-compatibility', 'openaiCompatibility', 'openAICompatibility'],
};

const getStringField = (record: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const providerKeyIdentity = (record: Record<string, unknown>) => {
  const apiKey = getStringField(record, ['api-key', 'apiKey']);
  if (!apiKey) return '';
  const baseUrl = getStringField(record, ['base-url', 'baseUrl', 'base_url']);
  return `${apiKey}\u0000${baseUrl}`;
};

const openAIProviderIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['name', 'id']);

const modelIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['name', 'id', 'model']);

const apiKeyEntryIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['api-key', 'apiKey', 'key']);

const cloneWithoutKnownFields = (
  raw: unknown,
  knownFields: readonly string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  knownFields.forEach((field) => {
    delete next[field];
  });
  return next;
};

const mergeKnownFields = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = cloneWithoutKnownFields(raw, knownFields);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
};

const findRawRecord = (
  rawRecords: Array<Record<string, unknown> | undefined>,
  usedIndexes: Set<number>,
  payload: Record<string, unknown>,
  index: number,
  getIdentity: (record: Record<string, unknown>) => string
) => {
  const identity = getIdentity(payload);
  if (identity) {
    for (let i = 0; i < rawRecords.length; i += 1) {
      const candidate = rawRecords[i];
      if (!candidate || usedIndexes.has(i)) continue;
      if (getIdentity(candidate) === identity) {
        usedIndexes.add(i);
        return candidate;
      }
    }
  }

  const fallback = rawRecords[index];
  if (fallback && !usedIndexes.has(index)) {
    usedIndexes.add(index);
    return fallback;
  }

  return undefined;
};

const mergeKnownRecordList = (
  rawItems: unknown,
  payloadItems: Record<string, unknown>[],
  knownFields: readonly string[],
  getIdentity: (record: Record<string, unknown>) => string
) => {
  const rawRecords = Array.isArray(rawItems)
    ? rawItems.map((item) => (isRecord(item) ? item : undefined))
    : [];
  const usedIndexes = new Set<number>();

  return payloadItems.map((payload, index) => {
    const raw = findRawRecord(rawRecords, usedIndexes, payload, index, getIdentity);
    return mergeKnownFields(raw, payload, knownFields);
  });
};

const getRawSectionList = (rawConfig: unknown, section: string) => {
  if (!isRecord(rawConfig)) return [];
  const aliases = RAW_SECTION_ALIASES[section] ?? [section];
  for (const alias of aliases) {
    const value = rawConfig[alias];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const mergeModelPayloads = (raw: unknown, models: unknown) =>
  Array.isArray(models)
    ? mergeKnownRecordList(
        isRecord(raw) ? raw.models : undefined,
        models.filter(isRecord),
        MODEL_ALIAS_FIELDS,
        modelIdentity
      )
    : undefined;

const mergeProviderKeyPayload = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = mergeKnownFields(raw, payload, knownFields);
  const models = mergeModelPayloads(raw, payload.models);
  if (models) next.models = models;
  if (isRecord(payload.cloak)) {
    next.cloak = mergeKnownFields(
      isRecord(raw) ? raw.cloak : undefined,
      payload.cloak,
      CLOAK_FIELDS
    );
  }
  return next;
};

const mergeOpenAIProviderPayload = (raw: unknown, payload: Record<string, unknown>) => {
  const next = mergeKnownFields(raw, payload, OPENAI_PROVIDER_FIELDS);
  const rawApiKeyEntries = isRecord(raw)
    ? raw['api-key-entries'] ?? raw.apiKeyEntries
    : undefined;
  const apiKeyEntries = payload['api-key-entries'];
  if (Array.isArray(apiKeyEntries)) {
    next['api-key-entries'] = mergeKnownRecordList(
      rawApiKeyEntries,
      apiKeyEntries.filter(isRecord),
      API_KEY_ENTRY_FIELDS,
      apiKeyEntryIdentity
    );
  }
  const models = mergeModelPayloads(raw, payload.models);
  if (models) next.models = models;
  return next;
};

const buildPreservedList = async <T>(
  section: string,
  configs: T[],
  serialize: (item: T) => Record<string, unknown>,
  mergePayload: (raw: unknown, payload: Record<string, unknown>) => Record<string, unknown>,
  getIdentity: (record: Record<string, unknown>) => string
) => {
  const payloads = configs.map((item) => serialize(item));

  let rawConfig: unknown;
  try {
    rawConfig = await apiClient.get('/config');
  } catch {
    return payloads;
  }

  const rawItems = getRawSectionList(rawConfig, section);
  const rawRecords = Array.isArray(rawItems)
    ? rawItems.map((item) => (isRecord(item) ? item : undefined))
    : [];
  const usedIndexes = new Set<number>();

  return payloads.map((payload, index) => {
    const raw = findRawRecord(rawRecords, usedIndexes, payload, index, getIdentity);
    return mergePayload(raw, payload);
  });
};

const mutateLatestProviderList = async (
  section: string,
  mutate: (latestItems: unknown[]) => unknown[]
) => {
  const rawConfig = await apiClient.get('/config');
  return apiClient.put(`/${section}`, mutate(getRawSectionList(rawConfig, section)));
};

const appendLatestProviderRecord = (
  latestItems: unknown[],
  payload: Record<string, unknown>,
  mergePayload: (raw: unknown, value: Record<string, unknown>) => Record<string, unknown>
) => [...latestItems, mergePayload(undefined, payload)];

const replaceLatestProviderRecord = (
  latestItems: unknown[],
  isTarget: (record: Record<string, unknown>, index: number) => boolean,
  payload: Record<string, unknown>,
  mergePayload: (raw: unknown, value: Record<string, unknown>) => Record<string, unknown>
) => {
  const targetIndex = latestItems.findIndex(
    (item, index) => isRecord(item) && isTarget(item, index)
  );
  if (targetIndex < 0) {
    throw new Error('Provider configuration changed; refresh and try again.');
  }
  return latestItems.map((item, index) =>
    index === targetIndex ? mergePayload(item, payload) : item
  );
};

const matchesProviderKey = (
  record: Record<string, unknown>,
  apiKey: string,
  baseUrl?: string
) =>
  getStringField(record, ['api-key', 'apiKey']) === apiKey.trim() &&
  getStringField(record, ['base-url', 'baseUrl', 'base_url']) === (baseUrl ?? '').trim();

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const buildProviderDeleteQuery = (apiKey: string, baseUrl?: string) => {
  const params = new URLSearchParams();
  params.set('api-key', apiKey.trim());
  params.set('base-url', (baseUrl ?? '').trim());
  return `?${params.toString()}`;
};

const serializeModelAliases = (models?: ModelAlias[], includeOpenAIFields = false) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { name: model.name };
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias;
          }
          if (model.priority !== undefined) {
            payload.priority = model.priority;
          }
          if (model.testModel) {
            payload['test-model'] = model.testModel;
          }
          if (includeOpenAIFields && model.image) payload.image = true;
          if (includeOpenAIFields && model.thinking) payload.thinking = model.thinking;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeApiKeyEntry = (entry: ApiKeyEntry) => {
  const payload: Record<string, unknown> = {};
  const apiKey = entry.apiKey?.trim();
  if (apiKey) payload['api-key'] = apiKey;
  if (entry.proxyUrl) payload['proxy-url'] = entry.proxyUrl;
  const headers = serializeHeaders(entry.headers);
  if (headers) payload.headers = headers;
  return payload;
};

const serializeProviderKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = {};
  if (config.name?.trim()) payload.name = config.name.trim();
  const apiKey = config.apiKey?.trim();
  if (apiKey) payload['api-key'] = apiKey;
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  const experimentalCchSigning =
    config.experimentalCchSigning ?? config.experimentalCCHSigning;
  if (experimentalCchSigning !== undefined) {
    payload['experimental-cch-signing'] = experimentalCchSigning;
  }
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = {};
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    if (config.cloak.strictMode !== undefined) cloakPayload['strict-mode'] = config.cloak.strictMode;
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    }
    const cacheUserId = config.cloak.cacheUserId ?? config.cloak.cacheUserID;
    if (cacheUserId !== undefined) {
      cloakPayload['cache-user-id'] = cacheUserId;
    }
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    }
  }
  return payload;
};

const serializeVertexModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (!name || !alias) return null;
          return { name, alias };
        })
        .filter(Boolean)
    : undefined;

const serializeVertexKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = {};
  const apiKey = config.apiKey?.trim();
  if (apiKey) payload['api-key'] = apiKey;
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeVertexModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeGeminiKey = (config: GeminiKeyConfig) => {
  const payload: Record<string, unknown> = {};
  const apiKey = config.apiKey?.trim();
  if (apiKey) payload['api-key'] = apiKey;
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeOpenAIProvider = (provider: OpenAIProviderConfig) => {
  const payload: Record<string, unknown> = {
    name: provider.name,
    'base-url': provider.baseUrl,
    'api-key-entries': Array.isArray(provider.apiKeyEntries)
      ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
      : []
  };
  if (provider.prefix?.trim()) payload.prefix = provider.prefix.trim();
  if (provider.disabled !== undefined) payload.disabled = provider.disabled;
  const headers = serializeHeaders(provider.headers);
  if (headers) payload.headers = headers;
  if (provider.chatCompletionsOnly !== undefined) {
    payload['chat-completions-only'] = provider.chatCompletionsOnly;
  }
  if (provider.supportPromptCacheKey !== undefined) {
    payload['support-prompt-cache-key'] = provider.supportPromptCacheKey;
  }
  const models = serializeModelAliases(provider.models, true);
  if (models && models.length) payload.models = models;
  if (provider.priority !== undefined) payload.priority = provider.priority;
  if (provider.testModel) payload['test-model'] = provider.testModel;
  if (provider.disableCooling !== undefined) {
    payload['disable-cooling'] = provider.disableCooling;
  }
  return payload;
};

export const providersApi = {
  async getGeminiKeys(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/gemini-api-key');
    const list = extractArrayPayload(data, 'gemini-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveGeminiKeys: async (configs: GeminiKeyConfig[]) =>
    apiClient.put(
      '/gemini-api-key',
      await buildPreservedList(
        'gemini-api-key',
        configs,
        serializeGeminiKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, GEMINI_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  createGeminiKey: (config: GeminiKeyConfig) =>
    mutateLatestProviderList('gemini-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeGeminiKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, GEMINI_KEY_FIELDS)
      )
    ),

  updateGeminiKey: (
    indexOrApiKey: number | string,
    valueOrBaseUrl: GeminiKeyConfig | string | undefined,
    config?: GeminiKeyConfig
  ) => {
    if (typeof indexOrApiKey === 'number') {
      return apiClient.patch('/gemini-api-key', {
        index: indexOrApiKey,
        value: serializeGeminiKey(valueOrBaseUrl as GeminiKeyConfig),
      });
    }
    return mutateLatestProviderList('gemini-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record) => matchesProviderKey(record, indexOrApiKey, valueOrBaseUrl as string | undefined),
        serializeGeminiKey(config as GeminiKeyConfig),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, GEMINI_KEY_FIELDS)
      )
    );
  },

  deleteGeminiKey: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/gemini-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getCodexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/codex-api-key');
    const list = extractArrayPayload(data, 'codex-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveCodexConfigs: async (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/codex-api-key',
      await buildPreservedList(
        'codex-api-key',
        configs,
        serializeProviderKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  createCodexConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('codex-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    ),

  updateCodexConfig: (
    indexOrApiKey: number | string,
    valueOrBaseUrl: ProviderKeyConfig | string | undefined,
    config?: ProviderKeyConfig
  ) => {
    if (typeof indexOrApiKey === 'number') {
      return apiClient.patch('/codex-api-key', {
        index: indexOrApiKey,
        value: serializeProviderKey(valueOrBaseUrl as ProviderKeyConfig),
      });
    }
    return mutateLatestProviderList('codex-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record) => matchesProviderKey(record, indexOrApiKey, valueOrBaseUrl as string | undefined),
        serializeProviderKey(config as ProviderKeyConfig),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    );
  },

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  createXAIConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('xai-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    ),

  updateXAIConfig: (apiKey: string, baseUrl: string | undefined, config: ProviderKeyConfig) =>
    mutateLatestProviderList('xai-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record) => matchesProviderKey(record, apiKey, baseUrl),
        serializeProviderKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    ),

  deleteXAIConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/xai-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: async (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/claude-api-key',
      await buildPreservedList(
        'claude-api-key',
        configs,
        serializeProviderKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  createClaudeConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('claude-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    ),

  updateClaudeConfig: (
    indexOrApiKey: number | string,
    valueOrBaseUrl: ProviderKeyConfig | string | undefined,
    config?: ProviderKeyConfig
  ) => {
    if (typeof indexOrApiKey === 'number') {
      return apiClient.patch('/claude-api-key', {
        index: indexOrApiKey,
        value: serializeProviderKey(valueOrBaseUrl as ProviderKeyConfig),
      });
    }
    return mutateLatestProviderList('claude-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record) => matchesProviderKey(record, indexOrApiKey, valueOrBaseUrl as string | undefined),
        serializeProviderKey(config as ProviderKeyConfig),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, PROVIDER_KEY_FIELDS)
      )
    );
  },

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getVertexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/vertex-api-key');
    const list = extractArrayPayload(data, 'vertex-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveVertexConfigs: async (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/vertex-api-key',
      await buildPreservedList(
        'vertex-api-key',
        configs,
        serializeVertexKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, VERTEX_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  createVertexConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('vertex-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeVertexKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, VERTEX_KEY_FIELDS)
      )
    ),

  updateVertexConfig: (
    indexOrApiKey: number | string,
    valueOrBaseUrl: ProviderKeyConfig | string | undefined,
    config?: ProviderKeyConfig
  ) => {
    if (typeof indexOrApiKey === 'number') {
      return apiClient.patch('/vertex-api-key', {
        index: indexOrApiKey,
        value: serializeVertexKey(valueOrBaseUrl as ProviderKeyConfig),
      });
    }
    return mutateLatestProviderList('vertex-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record) => matchesProviderKey(record, indexOrApiKey, valueOrBaseUrl as string | undefined),
        serializeVertexKey(config as ProviderKeyConfig),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, VERTEX_KEY_FIELDS)
      )
    );
  },

  deleteVertexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/vertex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item, index) => normalizeOpenAIProvider(item, index))
      .filter(Boolean) as OpenAIProviderConfig[];
  },

  saveOpenAIProviders: async (providers: OpenAIProviderConfig[]) =>
    apiClient.put(
      '/openai-compatibility',
      await buildPreservedList(
        'openai-compatibility',
        providers,
        serializeOpenAIProvider,
        mergeOpenAIProviderPayload,
        openAIProviderIdentity
      )
    ),

  createOpenAIProvider: (provider: OpenAIProviderConfig) =>
    mutateLatestProviderList('openai-compatibility', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeOpenAIProvider(provider), mergeOpenAIProviderPayload)
    ),

  updateOpenAIProvider: (
    indexOrName: number | string,
    valueOrIndex: OpenAIProviderConfig | number,
    provider?: OpenAIProviderConfig
  ) => {
    if (typeof indexOrName === 'number') {
      return apiClient.patch('/openai-compatibility', {
        index: indexOrName,
        value: serializeOpenAIProvider(valueOrIndex as OpenAIProviderConfig),
      });
    }
    return mutateLatestProviderList('openai-compatibility', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) =>
          index === valueOrIndex && openAIProviderIdentity(record) === indexOrName.trim(),
        serializeOpenAIProvider(provider as OpenAIProviderConfig),
        mergeOpenAIProviderPayload
      )
    );
  },

  updateOpenAIProviderDisabled: (index: number, disabled: boolean) =>
    apiClient.patch('/openai-compatibility', { index, value: { disabled } }),

  deleteOpenAIProvider: (nameOrIndex: string | number) =>
    typeof nameOrIndex === 'number'
      ? apiClient.delete(`/openai-compatibility?index=${encodeURIComponent(String(nameOrIndex))}`)
      : apiClient.delete(`/openai-compatibility?name=${encodeURIComponent(nameOrIndex)}`)
};

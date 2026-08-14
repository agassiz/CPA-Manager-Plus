import { apiClient } from './client';

export type ApiKeyAccessRule = {
  apiKey: string;
  models: string[];
  authIds: string[];
  providers: string[];
};

export type ApiKeyAccessCredential = {
  id: string;
  name: string;
  provider: string;
  status: string;
};

export type ApiKeyAccessProvider = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
};

export type ApiKeyAccessOptions = {
  providers: ApiKeyAccessProvider[];
  credentials: ApiKeyAccessCredential[];
};

type ApiKeyAccessResponse = {
  items?: Array<{
    'api-key'?: unknown;
    models?: unknown;
    'auth-ids'?: unknown;
    providers?: unknown;
  }>;
};

type ApiKeyAccessOptionsResponse = {
  providers?: Array<{
    id?: unknown;
    type?: unknown;
    name?: unknown;
    enabled?: unknown;
  }>;
  credentials?: Array<{
    id?: unknown;
    name?: unknown;
    provider?: unknown;
    status?: unknown;
  }>;
};

const normalizeValues = (value: unknown, lower = false): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => String(entry).trim())
            .map((entry) => (lower ? entry.toLowerCase() : entry))
            .filter(Boolean)
        )
      )
    : [];

const normalizeRule = (rule: ApiKeyAccessRule): ApiKeyAccessRule => ({
  apiKey: String(rule.apiKey ?? '').trim(),
  models: normalizeValues(rule.models, true),
  authIds: normalizeValues(rule.authIds),
  providers: Array.from(
    new Set(normalizeValues(rule.providers, true))
  ),
});

export const apiKeyAccessApi = {
  async list(): Promise<ApiKeyAccessRule[]> {
    const response = await apiClient.get<ApiKeyAccessResponse>('/api-key-access');
    return Array.isArray(response.items)
      ? response.items.map((rule) =>
          normalizeRule({
            apiKey: String(rule['api-key'] ?? ''),
            models: normalizeValues(rule.models, true),
            authIds: normalizeValues(rule['auth-ids']),
            providers: normalizeValues(rule.providers, true),
          })
        )
      : [];
  },

  async options(): Promise<ApiKeyAccessOptions> {
    const response = await apiClient.get<ApiKeyAccessOptionsResponse>('/api-key-access/options');
    const providers = Array.isArray(response.providers)
      ? response.providers
          .map((provider) => ({
            id: String(provider.id ?? '').trim(),
            type: String(provider.type ?? '').trim(),
            name: String(provider.name ?? '').trim(),
            enabled: provider.enabled === true,
          }))
          .filter((provider) => provider.id && provider.type && provider.name)
      : [];
    const credentials = Array.isArray(response.credentials)
      ? response.credentials
          .map((credential) => ({
            id: String(credential.id ?? '').trim(),
            name: String(credential.name ?? '').trim(),
            provider: String(credential.provider ?? '').trim().toLowerCase(),
            status: String(credential.status ?? '').trim(),
          }))
          .filter((credential) => credential.id && credential.provider)
      : [];
    return {
      providers,
      credentials,
    };
  },

  replace: (items: ApiKeyAccessRule[]) =>
    apiClient.put('/api-key-access', {
      items: items.map((rule) => {
        const normalized = normalizeRule(rule);
        return {
          'api-key': normalized.apiKey,
          models: normalized.models,
          'auth-ids': normalized.authIds,
          providers: normalized.providers,
        };
      }),
    }),
};

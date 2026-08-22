import {
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderAuthIndices,
  getProviderRecentBuckets,
  getProviderRecentStatusData,
  getProviderTotalStats,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import {
  mergeRecentRequestBucketGroups,
  statusBarDataFromRecentRequests,
  type StatusBarData,
} from '@/utils/recentRequests';
import { isMultiProtocolSponsorBrand } from '@/features/providers/sponsorDefinitions';
import type {
  ProviderBrand,
  ProviderResource,
  SponsorProviderRaw,
} from '@/features/providers/types';

export interface ProviderCredentialEntry {
  key: string;
  apiKey: string;
  proxyUrl?: string;
  success: number;
  failure: number;
  authIndices: string[];
}

const getUsageProvider = (brand: ProviderBrand): string =>
  brand === 'claudeApi' ? 'claude' : brand;

const getSponsorCredentials = (
  raw: SponsorProviderRaw,
  usageByProvider: ProviderRecentUsageMap
): ProviderCredentialEntry[] => {
  const entries: ProviderCredentialEntry[] = [];

  raw.openai.forEach(({ config, index }) => {
    config.apiKeyEntries?.forEach((entry, entryIndex) => {
      const stats = getProviderTotalStats(
        usageByProvider,
        config.name,
        entry.apiKey,
        config.baseUrl
      );
      entries.push({
        key: `openai:${index}:${entryIndex}`,
        apiKey: entry.apiKey,
        proxyUrl: entry.proxyUrl,
        ...stats,
        authIndices: getProviderAuthIndices(
          usageByProvider,
          config.name,
          entry.apiKey,
          config.baseUrl
        ),
      });
    });
  });
  raw.codex.forEach(({ config, index }) => {
    entries.push({
      key: `codex:${index}`,
      apiKey: config.apiKey,
      proxyUrl: config.proxyUrl,
      ...getProviderTotalStats(usageByProvider, 'codex', config.apiKey, config.baseUrl),
      authIndices: getProviderAuthIndices(usageByProvider, 'codex', config.apiKey, config.baseUrl),
    });
  });
  raw.claude.forEach(({ config, index }) => {
    entries.push({
      key: `claude:${index}`,
      apiKey: config.apiKey,
      proxyUrl: config.proxyUrl,
      ...getProviderTotalStats(usageByProvider, 'claude', config.apiKey, config.baseUrl),
      authIndices: getProviderAuthIndices(usageByProvider, 'claude', config.apiKey, config.baseUrl),
    });
  });
  raw.gemini.forEach(({ config, index }) => {
    entries.push({
      key: `gemini:${index}`,
      apiKey: config.apiKey,
      proxyUrl: config.proxyUrl,
      ...getProviderTotalStats(usageByProvider, 'gemini', config.apiKey, config.baseUrl),
      authIndices: getProviderAuthIndices(usageByProvider, 'gemini', config.apiKey, config.baseUrl),
    });
  });

  return entries;
};

export const getAdditionalProviderCredentials = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): ProviderCredentialEntry[] => {
  if (isMultiProtocolSponsorBrand(resource.brand)) {
    return getSponsorCredentials(resource.raw as SponsorProviderRaw, usageByProvider);
  }
  if (resource.brand === 'openaiCompatibility') {
    const config = resource.raw as OpenAIProviderConfig;
    return (config.apiKeyEntries ?? []).map((entry, index) => ({
      key: `openai:${index}`,
      apiKey: entry.apiKey,
      proxyUrl: entry.proxyUrl,
      ...getProviderTotalStats(usageByProvider, config.name, entry.apiKey, config.baseUrl),
      authIndices: getProviderAuthIndices(
        usageByProvider,
        config.name,
        entry.apiKey,
        config.baseUrl
      ),
    }));
  }
  const config = resource.raw as ProviderKeyConfig;
  if (!config.apiKey) return [];
  return [
    {
      key: `${resource.brand}:${resource.originalIndex}`,
      apiKey: config.apiKey,
      proxyUrl: config.proxyUrl,
      ...getProviderTotalStats(
        usageByProvider,
        getUsageProvider(resource.brand),
        config.apiKey,
        config.baseUrl
      ),
      authIndices: getProviderAuthIndices(
        usageByProvider,
        getUsageProvider(resource.brand),
        config.apiKey,
        config.baseUrl
      ),
    },
  ];
};

export const getAdditionalProviderStats = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): { success: number; failure: number } => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderTotalStats(resource.raw as OpenAIProviderConfig, usageByProvider);
  }
  return getAdditionalProviderCredentials(resource, usageByProvider).reduce(
    (total, entry) => ({
      success: total.success + entry.success,
      failure: total.failure + entry.failure,
    }),
    { success: 0, failure: 0 }
  );
};

export const getAdditionalProviderAuthIndices = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): string[] =>
  Array.from(
    new Set(
      getAdditionalProviderCredentials(resource, usageByProvider).flatMap((entry) => entry.authIndices)
    )
  );

export const getAdditionalProviderStatusData = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): StatusBarData => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderRecentStatusData(resource.raw as OpenAIProviderConfig, usageByProvider);
  }
  if (!isMultiProtocolSponsorBrand(resource.brand)) {
    return getProviderRecentStatusData(
      usageByProvider,
      getUsageProvider(resource.brand),
      resource.apiKey ?? undefined,
      resource.baseUrl ?? undefined
    );
  }

  const raw = resource.raw as SponsorProviderRaw;
  const bucketGroups = [
    ...raw.openai.flatMap(({ config }) =>
      (config.apiKeyEntries ?? []).map((entry) =>
        getProviderRecentBuckets(usageByProvider, config.name, entry.apiKey, config.baseUrl)
      )
    ),
    ...raw.codex.map(({ config }) =>
      getProviderRecentBuckets(usageByProvider, 'codex', config.apiKey, config.baseUrl)
    ),
    ...raw.claude.map(({ config }) =>
      getProviderRecentBuckets(usageByProvider, 'claude', config.apiKey, config.baseUrl)
    ),
    ...raw.gemini.map(({ config }) =>
      getProviderRecentBuckets(usageByProvider, 'gemini', config.apiKey, config.baseUrl)
    ),
  ];
  return statusBarDataFromRecentRequests(mergeRecentRequestBucketGroups(bucketGroups));
};

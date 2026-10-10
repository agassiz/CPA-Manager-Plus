import { hasDisableAllModelsRule } from '@/components/providers/utils';
import type { ModelInfo } from '@/utils/models';
import type { ApiKeyFunUsageSummary } from './sponsor';
import { sponsorProtocolUrl, type SponsorProviderDefinition } from './sponsorDefinitions';
import type {
  ModelEntryInput,
  ProviderEntryFormInput,
  ProviderResource,
  SponsorKeyEntryInput,
  SponsorProtocol,
  SponsorProviderBrand,
  SponsorProviderRaw,
} from './types';

// Pure form-state helpers for the sponsor (multi-protocol) providers.

export const emptyModel = (): ModelEntryInput => ({ name: '', alias: '' });

export const emptySponsorKeyEntry = (
  definition: SponsorProviderDefinition,
  protocol: SponsorProtocol = definition.defaultProtocol
): SponsorKeyEntryInput => ({
  protocol,
  apiKey: '',
  existingApiKey: '',
  baseUrl: definition.baseUrlOptions[0]?.baseUrl ?? '',
  proxyUrl: '',
  prefix: '',
  disabled: false,
  disableCooling: false,
  priority: undefined,
  models: [emptyModel()],
});

export const emptySponsorForm = (definition: SponsorProviderDefinition): ProviderEntryFormInput => ({
  apiKey: '',
  name: '',
  baseUrl: '',
  proxyUrl: '',
  prefix: '',
  disabled: false,
  disableCooling: false,
  priority: undefined,
  models: [],
  headers: [],
  excludedModelsText: '',
  sponsorKeyEntries: [emptySponsorKeyEntry(definition)],
});

export const getSponsorRaw = (
  resource: ProviderResource | null,
  brand: SponsorProviderBrand
): SponsorProviderRaw | null => {
  if (!resource || resource.brand !== brand) return null;
  return resource.raw as SponsorProviderRaw;
};

export const protocolUrlForEntry = (
  entry: SponsorKeyEntryInput,
  definition: SponsorProviderDefinition
): string => sponsorProtocolUrl(definition.getProtocolUrls(entry.baseUrl), entry.protocol);

export const formatUsageAmount = (value: ApiKeyFunUsageSummary['remaining'], locale: string): string => {
  if (value === null) return '--';
  if (typeof value === 'number') {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 6,
    }).format(value);
  }
  return value;
};

export const isHealthyUsageSummary = (summary: ApiKeyFunUsageSummary): boolean => {
  const normalizedStatus = (summary.status ?? '').trim().toLowerCase();
  return summary.isValid && (!normalizedStatus || normalizedStatus === 'active');
};

export const modelsFromConfig = (
  models:
    | Array<{ name?: string; alias?: string; priority?: number; testModel?: string }>
    | undefined
): ModelEntryInput[] =>
  models?.length
    ? models.map((model) => ({
        name: model.name ?? '',
        alias: model.alias ?? '',
        priority: model.priority,
        testModel: model.testModel,
      }))
    : [emptyModel()];

export const sponsorEntryFromProviderKey = (
  definition: SponsorProviderDefinition,
  protocol: Exclude<SponsorProtocol, 'openai'>,
  config:
    | SponsorProviderRaw['codex'][number]['config']
    | SponsorProviderRaw['claude'][number]['config']
    | SponsorProviderRaw['gemini'][number]['config']
): SponsorKeyEntryInput => ({
  ...emptySponsorKeyEntry(definition, protocol),
  existingApiKey: config.apiKey ?? '',
  baseUrl: definition.resolveBaseUrl(config.baseUrl),
  proxyUrl: config.proxyUrl ?? '',
  prefix: config.prefix ?? '',
  disabled: hasDisableAllModelsRule(config.excludedModels),
  disableCooling: config.disableCooling === true,
  priority: config.priority,
  models: modelsFromConfig(config.models),
});

export const sponsorEntryFromOpenAI = (
  definition: SponsorProviderDefinition,
  config: SponsorProviderRaw['openai'][number]['config']
): SponsorKeyEntryInput => {
  const firstEntry = config.apiKeyEntries?.find((entry) => entry.apiKey?.trim());
  return {
    ...emptySponsorKeyEntry(definition, 'openai'),
    existingApiKey: firstEntry?.apiKey ?? '',
    baseUrl: definition.resolveBaseUrl(config.baseUrl),
    proxyUrl: firstEntry?.proxyUrl ?? '',
    prefix: config.prefix ?? '',
    disabled: config.disabled === true,
    disableCooling: config.disableCooling === true,
    priority: config.priority,
    models: modelsFromConfig(config.models),
  };
};

export const sponsorKeyEntriesFromRaw = (
  raw: SponsorProviderRaw | null,
  definition: SponsorProviderDefinition
): SponsorKeyEntryInput[] => {
  if (!raw) return [emptySponsorKeyEntry(definition)];
  const entries = definition.protocols.flatMap((protocol): SponsorKeyEntryInput[] => {
    if (protocol === 'openai') {
      const openai = raw.openai[0]?.config;
      return openai ? [sponsorEntryFromOpenAI(definition, openai)] : [];
    }
    const config = raw[protocol][0]?.config;
    return config ? [sponsorEntryFromProviderKey(definition, protocol, config)] : [];
  });
  return entries.length ? entries : [emptySponsorKeyEntry(definition)];
};

export const applyDiscoveredModels = (
  currentModels: ModelEntryInput[],
  incoming: ModelInfo[]
): ModelEntryInput[] => {
  if (!incoming.length) return currentModels;
  const seen = new Set<string>();
  const next: ModelEntryInput[] = [];
  currentModels.forEach((entry) => {
    const trimmed = (entry.name ?? '').trim();
    if (trimmed) {
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
    }
    next.push(entry);
  });
  const placeholderIdx = next.findIndex(
    (entry) => !(entry.name ?? '').trim() && !(entry.alias ?? '').trim()
  );
  if (placeholderIdx !== -1) {
    next.splice(placeholderIdx, 1);
  }
  incoming.forEach((info) => {
    const trimmed = info.name.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push({
      name: trimmed,
      alias: (info.alias ?? '').trim(),
    });
  });
  return next.length ? next : [emptyModel()];
};

import { useCallback, useMemo, useReducer } from 'react';
import { isMap, parse as parseYaml, parseDocument } from 'yaml';
import type {
  CodexContextWindowOverride,
  DisableImageGenerationMode,
  UsageModelEntry,
  VisualConfigValues,
  VisualConfigValidationErrors,
} from '@/types/visualConfig';
import { DEFAULT_VISUAL_VALUES, makeClientId } from '@/types/visualConfig';
import {
  arePayloadFilterRulesEqual,
  arePayloadRulesEqual,
  hasPayloadParamValidationErrors,
  parsePayloadFilterRules,
  parsePayloadRules,
  parseRawPayloadRules,
  serializePayloadFilterRulesForYaml,
  serializePayloadRulesForYaml,
  serializeRawPayloadRulesForYaml,
} from './visualConfigPayloadRules';

export {
  getPayloadParamValidationError,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from './visualConfigPayloadRules';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractApiKeyValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }

  const record = asRecord(raw);
  if (!record) return null;

  const candidates = [record['api-key'], record.apiKey, record.key, record.Key];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parseApiKeysText(raw: unknown): string {
  if (!Array.isArray(raw)) return '';

  const keys: string[] = [];
  for (const item of raw) {
    const key = extractApiKeyValue(item);
    if (key) keys.push(key);
  }
  return keys.join('\n');
}

function resolveApiKeysText(parsed: Record<string, unknown>): string {
  if (Object.prototype.hasOwnProperty.call(parsed, 'api-keys')) {
    return parseApiKeysText(parsed['api-keys']);
  }

  const auth = asRecord(parsed.auth);
  const providers = asRecord(auth?.providers);
  const configApiKeyProvider = asRecord(providers?.['config-api-key']);
  if (!configApiKeyProvider) return '';

  if (Object.prototype.hasOwnProperty.call(configApiKeyProvider, 'api-key-entries')) {
    return parseApiKeysText(configApiKeyProvider['api-key-entries']);
  }

  return parseApiKeysText(configApiKeyProvider['api-keys']);
}

function parseAPIKeyAccessRules(raw: unknown): VisualConfigValues['apiKeyAccessRules'] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    const rule = asRecord(item);
    if (!rule) return [];
    const apiKey = typeof rule['api-key'] === 'string' ? rule['api-key'].trim() : '';
    if (!apiKey) return [];
    const normalizeValues = (values: unknown, lower = false) =>
      Array.isArray(values)
        ? Array.from(
            new Set(
              values
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim())
                .map((value) => (lower ? value.toLowerCase() : value))
                .filter(Boolean)
            )
          )
        : [];
    return [{
      apiKey,
      authIds: normalizeValues(rule['auth-ids']),
      providers: normalizeValues(rule.providers, true),
    }];
  });
}

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlPath = string[];

function docHas(doc: YamlDocument, path: YamlPath): boolean {
  return doc.hasIn(path);
}

function ensureMapInDoc(doc: YamlDocument, path: YamlPath): void {
  const existing = doc.getIn(path, true);
  if (isMap(existing)) return;
  // Use a YAML node here; plain objects are not treated as collections by subsequent `setIn`.
  doc.setIn(path, doc.createNode({}));
}

function deleteIfMapEmpty(doc: YamlDocument, path: YamlPath): void {
  const value = doc.getIn(path, true);
  if (!isMap(value)) return;
  if (value.items.length === 0) doc.deleteIn(path);
}

function setBooleanInDoc(doc: YamlDocument, path: YamlPath, value: boolean): void {
  if (value) {
    doc.setIn(path, true);
    return;
  }
  if (docHas(doc, path)) doc.setIn(path, false);
}

function shouldWriteManagedField(
  doc: YamlDocument,
  path: YamlPath,
  dirtyFields: Set<string>,
  dirtyKey: string
): boolean {
  // Optional fields managed by the visual editor must not be created during unrelated saves.
  // Only materialize them when the YAML already had the key or the user changed that field.
  // Use this guard for future optional visual-editor fields instead of unconditional `setIn`.
  return docHas(doc, path) || dirtyFields.has(dirtyKey);
}

function setStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed !== '') {
    doc.setIn(path, safe);
    return;
  }
  // Preserve existing empty-string keys to avoid dropping template blocks/comments.
  // Only keep the key when it already exists in the YAML.
  if (docHas(doc, path)) {
    doc.setIn(path, '');
  }
}

function setIntFromStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed === '') {
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    doc.setIn(path, parsed);
    return;
  }
}

function setDisableImageGenerationInDoc(
  doc: YamlDocument,
  path: YamlPath,
  value: DisableImageGenerationMode
): void {
  if (value === 'chat') {
    doc.setIn(path, 'chat');
    return;
  }

  if (value === 'true') {
    doc.setIn(path, true);
    return;
  }

  if (docHas(doc, path)) doc.setIn(path, false);
}

function getNonNegativeIntegerError(value: string): 'non_negative_integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'non_negative_integer';
  return Number(trimmed) >= 0 ? undefined : 'non_negative_integer';
}

function getPortError(value: string): 'port_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'port_range';
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= 65535 ? undefined : 'port_range';
}

function parseDisableImageGenerationMode(raw: unknown): DisableImageGenerationMode {
  if (raw === true) return 'true';
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return 'true';
    if (normalized === 'chat') return 'chat';
  }
  return 'false';
}

function parseKiroCooldownStrategy(raw: unknown): VisualConfigValues['kiroCooldownStrategy'] {
  if (typeof raw !== 'string') return 'linear';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'fixed') return 'fixed';
  if (normalized === 'exponential' || normalized === 'exponential-increase') return 'exponential';
  return 'linear';
}

function asFiniteNumber(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function stringifyConfigObject(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return '';
  }
}

const USAGE_MODEL_KNOWN_KEYS = new Set([
  'displayName',
  'display-name',
  'shortName',
  'short-name',
  'description',
  'disabled',
  'isNew',
  'is-new',
  'isDefault',
  'is-default',
  'isLegacyModel',
  'is-legacy-model',
  'modelGroupPriority',
  'model-group-priority',
  'priority',
  'historySummaryOverrides',
  'history-summary-overrides',
]);

function parseUsageModels(raw: unknown): UsageModelEntry[] {
  const models = asRecord(raw);
  if (!models) return [];

  return Object.entries(models)
    .map(([name, value], index): UsageModelEntry => {
      const model = asRecord(value) ?? {};
      const extra = Object.fromEntries(
        Object.entries(model).filter(([key]) => !USAGE_MODEL_KNOWN_KEYS.has(key))
      );
      return {
        id: makeClientId(),
        name,
        displayName:
          typeof model.displayName === 'string'
            ? model.displayName
            : typeof model['display-name'] === 'string'
              ? model['display-name']
              : '',
        shortName:
          typeof model.shortName === 'string'
            ? model.shortName
            : typeof model['short-name'] === 'string'
              ? model['short-name']
              : '',
        description: typeof model.description === 'string' ? model.description : '',
        disabled: Boolean(model.disabled),
        isNew: Boolean(model.isNew ?? model['is-new']),
        isDefault: Boolean(model.isDefault ?? model['is-default']),
        isLegacyModel: Boolean(model.isLegacyModel ?? model['is-legacy-model']),
        modelGroupPriority: asFiniteNumber(
          model.modelGroupPriority ?? model['model-group-priority'],
          0
        ),
        priority: asFiniteNumber(model.priority, index + 1),
        historySummaryOverrides: stringifyConfigObject(
          model.historySummaryOverrides ?? model['history-summary-overrides']
        ),
        extra,
      };
    })
    .sort(
      (left, right) =>
        left.modelGroupPriority - right.modelGroupPriority ||
        left.priority - right.priority ||
        left.name.localeCompare(right.name)
    );
}

function parseCodexModelContextWindowOverrides(raw: unknown): CodexContextWindowOverride[] {
  const overrides = asRecord(raw);
  if (!overrides) return [];

  return Object.entries(overrides)
    .map(([model, contextWindow]) => ({
      id: makeClientId(),
      model,
      contextWindow: String(contextWindow ?? ''),
    }))
    .sort((left, right) => left.model.localeCompare(right.model));
}

function hasInvalidCodexModelContextWindowOverrides(
  overrides: CodexContextWindowOverride[]
): boolean {
  const seenModels = new Set<string>();
  for (const override of overrides) {
    const model = override.model.trim();
    const contextWindow = override.contextWindow.trim();
    if (!model || seenModels.has(model) || !/^\d+$/.test(contextWindow)) return true;
    const parsed = Number(contextWindow);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return true;
    seenModels.add(model);
  }
  return false;
}

function serializeCodexModelContextWindowOverrides(
  overrides: CodexContextWindowOverride[]
): Record<string, number> {
  return Object.fromEntries(
    overrides
      .map((override) => {
        const model = override.model.trim();
        const contextWindow = override.contextWindow.trim();
        const value = Number(contextWindow);
        if (!model || !/^\d+$/.test(contextWindow) || !Number.isSafeInteger(value) || value <= 0) {
          return null;
        }
        return [model, value] as const;
      })
      .filter((entry): entry is readonly [string, number] => entry !== null)
  );
}

function parseHistorySummaryOverrides(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return parseYaml(trimmed);
  } catch {
    return value;
  }
}

function serializeUsageModelsForYaml(models: UsageModelEntry[]): Record<string, unknown> {
  const sortedModels = [...models].sort(
    (left, right) =>
      left.modelGroupPriority - right.modelGroupPriority ||
      left.priority - right.priority ||
      left.name.localeCompare(right.name)
  );

  return Object.fromEntries(
    sortedModels
      .filter((model) => model.name.trim())
      .map((model) => {
        const historySummaryOverrides = parseHistorySummaryOverrides(model.historySummaryOverrides);
        const body: Record<string, unknown> = { ...model.extra };
        if (model.displayName.trim()) body.displayName = model.displayName;
        if (model.shortName.trim()) body.shortName = model.shortName;
        if (model.description.trim()) body.description = model.description;
        body.disabled = model.disabled;
        if (model.isNew || Object.prototype.hasOwnProperty.call(model.extra, 'isNew')) {
          body.isNew = model.isNew;
        }
        if (model.isDefault || Object.prototype.hasOwnProperty.call(model.extra, 'isDefault')) {
          body.isDefault = model.isDefault;
        }
        if (
          model.isLegacyModel ||
          Object.prototype.hasOwnProperty.call(model.extra, 'isLegacyModel')
        ) {
          body.isLegacyModel = model.isLegacyModel;
        }
        if (historySummaryOverrides !== undefined) {
          body.historySummaryOverrides = historySummaryOverrides;
        }
        body.modelGroupPriority = model.modelGroupPriority;
        body.priority = model.priority;
        return [model.name.trim(), body];
      })
  );
}

function areUsageModelsEqual(left: UsageModelEntry[], right: UsageModelEntry[]): boolean {
  const normalize = (models: UsageModelEntry[]) =>
    models.map(({ id: _id, ...model }) => model).sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function areCodexModelContextWindowOverridesEqual(
  left: CodexContextWindowOverride[],
  right: CodexContextWindowOverride[]
): boolean {
  const normalize = (overrides: CodexContextWindowOverride[]) =>
    overrides
      .map(({ id: _id, model, contextWindow }) => ({
        model: model.trim(),
        contextWindow: contextWindow.trim(),
      }))
      .sort(
        (first, second) =>
          first.model.localeCompare(second.model) ||
          first.contextWindow.localeCompare(second.contextWindow)
      );
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function getVisualConfigValidationErrors(
  values: VisualConfigValues
): VisualConfigValidationErrors {
  return {
    port: getPortError(values.port),
    errorLogsMaxFiles: getNonNegativeIntegerError(values.errorLogsMaxFiles),
    logsMaxTotalSizeMb: getNonNegativeIntegerError(values.logsMaxTotalSizeMb),
    requestRetry: getNonNegativeIntegerError(values.requestRetry),
    maxRetryCredentials: getNonNegativeIntegerError(values.maxRetryCredentials),
    maxRetryInterval: getNonNegativeIntegerError(values.maxRetryInterval),
    authAutoRefreshWorkers: getNonNegativeIntegerError(values.authAutoRefreshWorkers),
    codexModelContextWindowOverrides: hasInvalidCodexModelContextWindowOverrides(
      values.codexModelContextWindowOverrides
    )
      ? 'invalid_context_window_overrides'
      : undefined,
    kiroPerAccountRpmLimit: getNonNegativeIntegerError(values.kiroPerAccountRpmLimit),
    kiroFreeRpmLimit: getNonNegativeIntegerError(values.kiroFreeRpmLimit),
    kiroProRpmLimit: getNonNegativeIntegerError(values.kiroProRpmLimit),
    kiroBaseCooldownSeconds: getNonNegativeIntegerError(values.kiroBaseCooldownSeconds),
    kiroMaxCooldownSeconds: getNonNegativeIntegerError(values.kiroMaxCooldownSeconds),
    kiroConsecutiveErrorCooldownThreshold: getNonNegativeIntegerError(
      values.kiroConsecutiveErrorCooldownThreshold
    ),
    kiroConsecutiveErrorDisableThreshold: getNonNegativeIntegerError(
      values.kiroConsecutiveErrorDisableThreshold
    ),
    'streaming.keepaliveSeconds': getNonNegativeIntegerError(values.streaming.keepaliveSeconds),
    'streaming.bootstrapRetries': getNonNegativeIntegerError(values.streaming.bootstrapRetries),
    'streaming.nonstreamKeepaliveInterval': getNonNegativeIntegerError(
      values.streaming.nonstreamKeepaliveInterval
    ),
  };
}

function deleteLegacyApiKeysProvider(doc: YamlDocument): void {
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-key-entries'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-key-entries']);
  }
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-keys'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-keys']);
  }
  deleteIfMapEmpty(doc, ['auth', 'providers', 'config-api-key']);
  deleteIfMapEmpty(doc, ['auth', 'providers']);
  deleteIfMapEmpty(doc, ['auth']);
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

type VisualConfigState = {
  visualValues: VisualConfigValues;
  baselineValues: VisualConfigValues;
  dirtyFields: Set<string>;
  visualParseError: string | null;
};

type VisualConfigAction =
  | {
      type: 'load_success';
      values: VisualConfigValues;
    }
  | {
      type: 'load_error';
      error: string;
    }
  | {
      type: 'set_values';
      values: Partial<VisualConfigValues>;
    };

function createInitialVisualConfigState(): VisualConfigState {
  const initialValues = deepClone(DEFAULT_VISUAL_VALUES);
  return {
    visualValues: initialValues,
    baselineValues: deepClone(initialValues),
    dirtyFields: new Set(),
    visualParseError: null,
  };
}

function mergeVisualConfigValues(
  currentValues: VisualConfigValues,
  patch: Partial<VisualConfigValues>
): VisualConfigValues {
  const nextValues: VisualConfigValues = { ...currentValues, ...patch } as VisualConfigValues;
  if (patch.streaming) {
    nextValues.streaming = { ...currentValues.streaming, ...patch.streaming };
  }
  return nextValues;
}

function getNextDirtyFields(
  currentDirtyFields: Set<string>,
  patch: Partial<VisualConfigValues>,
  nextValues: VisualConfigValues,
  baselineValues: VisualConfigValues
): Set<string> {
  const nextDirtyFields = new Set(currentDirtyFields);
  const updateDirty = (key: string, isEqual: boolean) => {
    if (isEqual) {
      nextDirtyFields.delete(key);
    } else {
      nextDirtyFields.add(key);
    }
  };
  const updateScalarDirty = (key: keyof VisualConfigValues) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      updateDirty(key, nextValues[key] === baselineValues[key]);
    }
  };

  (
    [
      'rmDisableAutoUpdatePanel',
      'errorLogsMaxFiles',
      'pluginsEnabled',
      'codexForceSuperCategory',
      'codexBugMode',
      'passthroughHeaders',
      'hideUpstreamErrorDetails',
      'disableClaudeCloakMode',
      'experimentalCCHSigning',
      'disableCooling',
      'disableAutoDisable',
      'disableImageGeneration',
      'imageFallbackModel',
      'responsesCompactFallbackModel',
      'authAutoRefreshWorkers',
      'enableGeminiCliEndpoint',
      'antigravitySignatureCacheEnabled',
      'antigravitySignatureBypassStrict',
      'claudeHeaderUserAgent',
      'claudeHeaderPackageVersion',
      'claudeHeaderRuntimeVersion',
      'claudeHeaderOs',
      'claudeHeaderArch',
      'claudeHeaderTimeout',
      'claudeHeaderStabilizeDeviceProfile',
      'codexHeaderUserAgent',
      'codexHeaderBetaFeatures',
      'codexIdentityConfuse',
      'augmentSilentModeModel',
      'augmentCodebaseRetrievalModel',
      'augmentUseConfiguredCompletionModels',
      'augmentCodeCompletionModel',
      'augmentChatInputCompletionModel',
      'augmentShowThinkingProgress',
      'kiroPerAccountRpmLimit',
      'kiroFreeRpmLimit',
      'kiroProRpmLimit',
      'kiroCooldownStrategy',
      'kiroBaseCooldownSeconds',
      'kiroMaxCooldownSeconds',
      'kiroConsecutiveErrorCooldownThreshold',
      'kiroConsecutiveErrorDisableThreshold',
      'kiroInvalidAuthAutoDisable',
    ] as Array<keyof VisualConfigValues>
  ).forEach(updateScalarDirty);

  if (Object.prototype.hasOwnProperty.call(patch, 'host')) {
    updateDirty('host', nextValues.host === baselineValues.host);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'port')) {
    updateDirty('port', nextValues.port === baselineValues.port);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsEnable')) {
    updateDirty('tlsEnable', nextValues.tlsEnable === baselineValues.tlsEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsCert')) {
    updateDirty('tlsCert', nextValues.tlsCert === baselineValues.tlsCert);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsKey')) {
    updateDirty('tlsKey', nextValues.tlsKey === baselineValues.tlsKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmAllowRemote')) {
    updateDirty('rmAllowRemote', nextValues.rmAllowRemote === baselineValues.rmAllowRemote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmSecretKey')) {
    updateDirty('rmSecretKey', nextValues.rmSecretKey === baselineValues.rmSecretKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableControlPanel')) {
    updateDirty(
      'rmDisableControlPanel',
      nextValues.rmDisableControlPanel === baselineValues.rmDisableControlPanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmPanelRepo')) {
    updateDirty('rmPanelRepo', nextValues.rmPanelRepo === baselineValues.rmPanelRepo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authDir')) {
    updateDirty('authDir', nextValues.authDir === baselineValues.authDir);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'apiKeysText')) {
    updateDirty('apiKeysText', nextValues.apiKeysText === baselineValues.apiKeysText);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'debug')) {
    updateDirty('debug', nextValues.debug === baselineValues.debug);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'commercialMode')) {
    updateDirty('commercialMode', nextValues.commercialMode === baselineValues.commercialMode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'loggingToFile')) {
    updateDirty('loggingToFile', nextValues.loggingToFile === baselineValues.loggingToFile);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'logsMaxTotalSizeMb')) {
    updateDirty(
      'logsMaxTotalSizeMb',
      nextValues.logsMaxTotalSizeMb === baselineValues.logsMaxTotalSizeMb
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'proxyUrl')) {
    updateDirty('proxyUrl', nextValues.proxyUrl === baselineValues.proxyUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'forceModelPrefix')) {
    updateDirty(
      'forceModelPrefix',
      nextValues.forceModelPrefix === baselineValues.forceModelPrefix
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requestRetry')) {
    updateDirty('requestRetry', nextValues.requestRetry === baselineValues.requestRetry);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryCredentials')) {
    updateDirty(
      'maxRetryCredentials',
      nextValues.maxRetryCredentials === baselineValues.maxRetryCredentials
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryInterval')) {
    updateDirty(
      'maxRetryInterval',
      nextValues.maxRetryInterval === baselineValues.maxRetryInterval
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'wsAuth')) {
    updateDirty('wsAuth', nextValues.wsAuth === baselineValues.wsAuth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchProject')) {
    updateDirty(
      'quotaSwitchProject',
      nextValues.quotaSwitchProject === baselineValues.quotaSwitchProject
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchPreviewModel')) {
    updateDirty(
      'quotaSwitchPreviewModel',
      nextValues.quotaSwitchPreviewModel === baselineValues.quotaSwitchPreviewModel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaAntigravityCredits')) {
    updateDirty(
      'quotaAntigravityCredits',
      nextValues.quotaAntigravityCredits === baselineValues.quotaAntigravityCredits
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingStrategy')) {
    updateDirty('routingStrategy', nextValues.routingStrategy === baselineValues.routingStrategy);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinity')) {
    updateDirty(
      'routingSessionAffinity',
      nextValues.routingSessionAffinity === baselineValues.routingSessionAffinity
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinityTTL')) {
    updateDirty(
      'routingSessionAffinityTTL',
      nextValues.routingSessionAffinityTTL === baselineValues.routingSessionAffinityTTL
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRules')) {
    updateDirty(
      'payloadDefaultRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRules, baselineValues.payloadDefaultRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRawRules')) {
    updateDirty(
      'payloadDefaultRawRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRawRules, baselineValues.payloadDefaultRawRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRules')) {
    updateDirty(
      'payloadOverrideRules',
      arePayloadRulesEqual(nextValues.payloadOverrideRules, baselineValues.payloadOverrideRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRawRules')) {
    updateDirty(
      'payloadOverrideRawRules',
      arePayloadRulesEqual(
        nextValues.payloadOverrideRawRules,
        baselineValues.payloadOverrideRawRules
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadFilterRules')) {
    updateDirty(
      'payloadFilterRules',
      arePayloadFilterRulesEqual(nextValues.payloadFilterRules, baselineValues.payloadFilterRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageModels')) {
    updateDirty(
      'usageModels',
      areUsageModelsEqual(nextValues.usageModels, baselineValues.usageModels)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexModelContextWindowOverrides')) {
    updateDirty(
      'codexModelContextWindowOverrides',
      areCodexModelContextWindowOverridesEqual(
        nextValues.codexModelContextWindowOverrides,
        baselineValues.codexModelContextWindowOverrides
      )
    );
  }
  if (patch.streaming) {
    const streamingPatch = patch.streaming;
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'keepaliveSeconds')) {
      updateDirty(
        'streaming.keepaliveSeconds',
        nextValues.streaming.keepaliveSeconds === baselineValues.streaming.keepaliveSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'bootstrapRetries')) {
      updateDirty(
        'streaming.bootstrapRetries',
        nextValues.streaming.bootstrapRetries === baselineValues.streaming.bootstrapRetries
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'nonstreamKeepaliveInterval')) {
      updateDirty(
        'streaming.nonstreamKeepaliveInterval',
        nextValues.streaming.nonstreamKeepaliveInterval ===
          baselineValues.streaming.nonstreamKeepaliveInterval
      );
    }
  }

  return nextDirtyFields;
}

function visualConfigReducer(
  state: VisualConfigState,
  action: VisualConfigAction
): VisualConfigState {
  switch (action.type) {
    case 'load_success':
      return {
        visualValues: action.values,
        baselineValues: deepClone(action.values),
        dirtyFields: new Set(),
        visualParseError: null,
      };
    case 'load_error':
      return {
        ...state,
        visualParseError: action.error,
      };
    case 'set_values': {
      const nextValues = mergeVisualConfigValues(state.visualValues, action.values);
      const nextDirtyFields = getNextDirtyFields(
        state.dirtyFields,
        action.values,
        nextValues,
        state.baselineValues
      );

      return {
        ...state,
        visualValues: nextValues,
        dirtyFields: nextDirtyFields,
      };
    }
    default:
      return state;
  }
}

export function useVisualConfig() {
  const [state, dispatch] = useReducer(
    visualConfigReducer,
    undefined,
    createInitialVisualConfigState
  );
  const { visualValues, visualParseError, dirtyFields } = state;
  const visualDirty = dirtyFields.size > 0;
  const visualValidationErrors = useMemo(
    () => getVisualConfigValidationErrors(visualValues),
    [visualValues]
  );
  const visualHasPayloadValidationErrors = useMemo(
    () =>
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRawRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRawRules),
    [
      visualValues.payloadDefaultRules,
      visualValues.payloadDefaultRawRules,
      visualValues.payloadOverrideRules,
      visualValues.payloadOverrideRawRules,
    ]
  );

  const loadVisualValuesFromYaml = useCallback((yamlContent: string) => {
    try {
      const document = parseDocument(yamlContent);
      if (document.errors.length > 0) {
        throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
      }

      const parsedRaw: unknown = parseYaml(yamlContent) || {};
      const parsed = asRecord(parsedRaw) ?? {};
      const tls = asRecord(parsed.tls);
      const remoteManagement = asRecord(parsed['remote-management']);
      const quotaExceeded = asRecord(parsed['quota-exceeded']);
      const routing = asRecord(parsed.routing);
      const augment = asRecord(parsed.augment);
      const kiroRequestPolicy = asRecord(parsed['kiro-request-policy']);
      const kiroRpmLimits = asRecord(kiroRequestPolicy?.['rpm-limits']);
      const payload = asRecord(parsed.payload);
      const streaming = asRecord(parsed.streaming);
      const claudeHeaderDefaults = asRecord(parsed['claude-header-defaults']);
      const codexHeaderDefaults = asRecord(parsed['codex-header-defaults']);
      const codex = asRecord(parsed.codex);
      const plugins = asRecord(parsed.plugins);

      const newValues: VisualConfigValues = {
        host: typeof parsed.host === 'string' ? parsed.host : '',
        port: String(parsed.port ?? ''),

        tlsEnable: Boolean(tls?.enable),
        tlsCert: typeof tls?.cert === 'string' ? tls.cert : '',
        tlsKey: typeof tls?.key === 'string' ? tls.key : '',

        rmAllowRemote: Boolean(remoteManagement?.['allow-remote']),
        rmSecretKey:
          typeof remoteManagement?.['secret-key'] === 'string'
            ? remoteManagement['secret-key']
            : '',
        rmDisableControlPanel: Boolean(remoteManagement?.['disable-control-panel']),
        rmDisableAutoUpdatePanel: Boolean(remoteManagement?.['disable-auto-update-panel']),
        rmPanelRepo:
          typeof remoteManagement?.['panel-github-repository'] === 'string'
            ? remoteManagement['panel-github-repository']
            : typeof remoteManagement?.['panel-repo'] === 'string'
              ? remoteManagement['panel-repo']
              : '',

        authDir: typeof parsed['auth-dir'] === 'string' ? parsed['auth-dir'] : '',
        apiKeysText: resolveApiKeysText(parsed),
        apiKeyAccessRules: parseAPIKeyAccessRules(parsed['api-key-access']),

        debug: Boolean(parsed.debug),
        commercialMode: Boolean(parsed['commercial-mode']),
        pluginsEnabled: Boolean(plugins?.enabled),
        loggingToFile: Boolean(parsed['logging-to-file']),
        logsMaxTotalSizeMb: String(parsed['logs-max-total-size-mb'] ?? ''),
        errorLogsMaxFiles: String(parsed['error-logs-max-files'] ?? ''),

        proxyUrl: typeof parsed['proxy-url'] === 'string' ? parsed['proxy-url'] : '',
        forceModelPrefix: Boolean(parsed['force-model-prefix']),
        imageFallbackModel:
          typeof parsed['image-fallback-model'] === 'string'
            ? parsed['image-fallback-model']
            : DEFAULT_VISUAL_VALUES.imageFallbackModel,
        responsesCompactFallbackModel:
          typeof codex?.['responses-compact-fallback-model'] === 'string'
            ? codex['responses-compact-fallback-model']
            : '',
        codexModelContextWindowOverrides: parseCodexModelContextWindowOverrides(
          codex?.['model-context-window-overrides']
        ),
        codexForceSuperCategory: Boolean(codex?.['force-super-category']),
        codexBugMode: Boolean(codex?.['bug-mode'] ?? codex?.bugMode),
        passthroughHeaders: Boolean(parsed['passthrough-headers']),
        hideUpstreamErrorDetails: Boolean(
          parsed['hide-upstream-error-details'] ?? DEFAULT_VISUAL_VALUES.hideUpstreamErrorDetails
        ),
        disableClaudeCloakMode: Boolean(parsed['disable-claude-cloak-mode']),
        experimentalCCHSigning: Boolean(parsed['experimental-cch-signing']),
        requestRetry: String(parsed['request-retry'] ?? ''),
        maxRetryCredentials: String(parsed['max-retry-credentials'] ?? ''),
        maxRetryInterval: String(parsed['max-retry-interval'] ?? ''),
        disableCooling: Boolean(parsed['disable-cooling']),
        disableAutoDisable: Boolean(parsed['disable-auto-disable']),
        disableImageGeneration: parseDisableImageGenerationMode(parsed['disable-image-generation']),
        authAutoRefreshWorkers: String(parsed['auth-auto-refresh-workers'] ?? ''),
        wsAuth: Boolean(parsed['ws-auth']),
        enableGeminiCliEndpoint: Boolean(parsed['enable-gemini-cli-endpoint']),
        antigravitySignatureCacheEnabled: Boolean(
          parsed['antigravity-signature-cache-enabled'] ?? true
        ),
        antigravitySignatureBypassStrict: Boolean(parsed['antigravity-signature-bypass-strict']),
        claudeHeaderUserAgent:
          typeof claudeHeaderDefaults?.['user-agent'] === 'string'
            ? claudeHeaderDefaults['user-agent']
            : '',
        claudeHeaderPackageVersion:
          typeof claudeHeaderDefaults?.['package-version'] === 'string'
            ? claudeHeaderDefaults['package-version']
            : '',
        claudeHeaderRuntimeVersion:
          typeof claudeHeaderDefaults?.['runtime-version'] === 'string'
            ? claudeHeaderDefaults['runtime-version']
            : '',
        claudeHeaderOs: typeof claudeHeaderDefaults?.os === 'string' ? claudeHeaderDefaults.os : '',
        claudeHeaderArch:
          typeof claudeHeaderDefaults?.arch === 'string' ? claudeHeaderDefaults.arch : '',
        claudeHeaderTimeout:
          typeof claudeHeaderDefaults?.timeout === 'string' ? claudeHeaderDefaults.timeout : '',
        claudeHeaderStabilizeDeviceProfile: Boolean(
          claudeHeaderDefaults?.['stabilize-device-profile']
        ),
        codexHeaderUserAgent:
          typeof codexHeaderDefaults?.['user-agent'] === 'string'
            ? codexHeaderDefaults['user-agent']
            : '',
        codexHeaderBetaFeatures:
          typeof codexHeaderDefaults?.['beta-features'] === 'string'
            ? codexHeaderDefaults['beta-features']
            : '',
        codexIdentityConfuse: Boolean(codex?.['identity-confuse'] ?? codex?.identityConfuse),

        quotaSwitchProject: Boolean(quotaExceeded?.['switch-project'] ?? true),
        quotaSwitchPreviewModel: Boolean(quotaExceeded?.['switch-preview-model'] ?? true),
        quotaAntigravityCredits: Boolean(quotaExceeded?.['antigravity-credits'] ?? false),

        routingStrategy: routing?.strategy === 'fill-first' ? 'fill-first' : 'round-robin',
        routingSessionAffinity: Boolean(
          routing?.['session-affinity'] ?? routing?.sessionAffinity ?? routing?.['sessionAffinity']
        ),
        routingSessionAffinityTTL:
          typeof routing?.['session-affinity-ttl'] === 'string'
            ? routing['session-affinity-ttl']
            : typeof routing?.sessionAffinityTTL === 'string'
              ? routing.sessionAffinityTTL
              : typeof routing?.['sessionAffinityTTL'] === 'string'
                ? routing['sessionAffinityTTL']
                : '',

        augmentSilentModeModel:
          typeof augment?.['silent-mode-model'] === 'string'
            ? augment['silent-mode-model']
            : DEFAULT_VISUAL_VALUES.augmentSilentModeModel,
        augmentCodebaseRetrievalModel:
          typeof augment?.['codebase-retrieval-model'] === 'string'
            ? augment['codebase-retrieval-model']
            : DEFAULT_VISUAL_VALUES.augmentCodebaseRetrievalModel,
        augmentUseConfiguredCompletionModels: Boolean(
          augment?.['use-configured-completion-models'] ??
          DEFAULT_VISUAL_VALUES.augmentUseConfiguredCompletionModels
        ),
        augmentCodeCompletionModel:
          typeof augment?.['code-completion-model'] === 'string'
            ? augment['code-completion-model']
            : DEFAULT_VISUAL_VALUES.augmentCodeCompletionModel,
        augmentChatInputCompletionModel:
          typeof augment?.['chat-input-completion-model'] === 'string'
            ? augment['chat-input-completion-model']
            : DEFAULT_VISUAL_VALUES.augmentChatInputCompletionModel,
        augmentShowThinkingProgress: Boolean(
          augment?.['show-thinking-progress'] ?? DEFAULT_VISUAL_VALUES.augmentShowThinkingProgress
        ),

        kiroPerAccountRpmLimit: String(
          kiroRequestPolicy?.['per-account-rpm-limit'] ??
            DEFAULT_VISUAL_VALUES.kiroPerAccountRpmLimit
        ),
        kiroFreeRpmLimit: String(kiroRpmLimits?.free ?? DEFAULT_VISUAL_VALUES.kiroFreeRpmLimit),
        kiroProRpmLimit: String(kiroRpmLimits?.pro ?? DEFAULT_VISUAL_VALUES.kiroProRpmLimit),
        kiroCooldownStrategy: parseKiroCooldownStrategy(kiroRequestPolicy?.['cooldown-strategy']),
        kiroBaseCooldownSeconds: String(
          kiroRequestPolicy?.['base-cooldown-seconds'] ??
            DEFAULT_VISUAL_VALUES.kiroBaseCooldownSeconds
        ),
        kiroMaxCooldownSeconds: String(
          kiroRequestPolicy?.['max-cooldown-seconds'] ??
            DEFAULT_VISUAL_VALUES.kiroMaxCooldownSeconds
        ),
        kiroConsecutiveErrorCooldownThreshold: String(
          kiroRequestPolicy?.['consecutive-error-cooldown-threshold'] ??
            DEFAULT_VISUAL_VALUES.kiroConsecutiveErrorCooldownThreshold
        ),
        kiroConsecutiveErrorDisableThreshold: String(
          kiroRequestPolicy?.['consecutive-error-disable-threshold'] ??
            DEFAULT_VISUAL_VALUES.kiroConsecutiveErrorDisableThreshold
        ),
        kiroInvalidAuthAutoDisable: Boolean(
          kiroRequestPolicy?.['invalid-auth-auto-disable'] ??
          DEFAULT_VISUAL_VALUES.kiroInvalidAuthAutoDisable
        ),

        usageModels: parseUsageModels(parsed['usage-models']),

        payloadDefaultRules: parsePayloadRules(payload?.default),
        payloadDefaultRawRules: parseRawPayloadRules(payload?.['default-raw']),
        payloadOverrideRules: parsePayloadRules(payload?.override),
        payloadOverrideRawRules: parseRawPayloadRules(payload?.['override-raw']),
        payloadFilterRules: parsePayloadFilterRules(payload?.filter),

        streaming: {
          keepaliveSeconds: String(streaming?.['keepalive-seconds'] ?? ''),
          bootstrapRetries: String(streaming?.['bootstrap-retries'] ?? ''),
          nonstreamKeepaliveInterval: String(parsed['nonstream-keepalive-interval'] ?? ''),
        },
      };

      dispatch({ type: 'load_success', values: newValues });
      return { ok: true as const };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid YAML';
      dispatch({ type: 'load_error', error: message });
      return { ok: false as const, error: message };
    }
  }, []);

  const applyVisualChangesToYaml = useCallback(
    (currentYaml: string): string => {
      try {
        const doc = parseDocument(currentYaml);
        if (doc.errors.length > 0) return currentYaml;
        if (!isMap(doc.contents)) {
          doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
        }
        const values = visualValues;

        setStringInDoc(doc, ['host'], values.host);
        setIntFromStringInDoc(doc, ['port'], values.port);

        if (
          docHas(doc, ['tls']) ||
          values.tlsEnable ||
          values.tlsCert.trim() ||
          values.tlsKey.trim()
        ) {
          ensureMapInDoc(doc, ['tls']);
          setBooleanInDoc(doc, ['tls', 'enable'], values.tlsEnable);
          setStringInDoc(doc, ['tls', 'cert'], values.tlsCert);
          setStringInDoc(doc, ['tls', 'key'], values.tlsKey);
          deleteIfMapEmpty(doc, ['tls']);
        }

        if (
          docHas(doc, ['remote-management']) ||
          values.rmAllowRemote ||
          values.rmSecretKey.trim() ||
          values.rmDisableControlPanel ||
          values.rmDisableAutoUpdatePanel ||
          values.rmPanelRepo.trim()
        ) {
          ensureMapInDoc(doc, ['remote-management']);
          setBooleanInDoc(doc, ['remote-management', 'allow-remote'], values.rmAllowRemote);
          setStringInDoc(doc, ['remote-management', 'secret-key'], values.rmSecretKey);
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-control-panel'],
            values.rmDisableControlPanel
          );
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-auto-update-panel'],
            values.rmDisableAutoUpdatePanel
          );
          setStringInDoc(doc, ['remote-management', 'panel-github-repository'], values.rmPanelRepo);
          if (docHas(doc, ['remote-management', 'panel-repo'])) {
            doc.deleteIn(['remote-management', 'panel-repo']);
          }
          deleteIfMapEmpty(doc, ['remote-management']);
        }

        setStringInDoc(doc, ['auth-dir'], values.authDir);
        const apiKeys = values.apiKeysText
          .split('\n')
          .map((key) => key.trim())
          .filter(Boolean);
        if (apiKeys.length > 0) {
          doc.setIn(['api-keys'], apiKeys);
        } else if (docHas(doc, ['api-keys'])) {
          doc.deleteIn(['api-keys']);
        }
        deleteLegacyApiKeysProvider(doc);

        setBooleanInDoc(doc, ['debug'], values.debug);

        setBooleanInDoc(doc, ['commercial-mode'], values.commercialMode);
        if (
          docHas(doc, ['plugins']) ||
          values.pluginsEnabled ||
          shouldWriteManagedField(doc, ['plugins', 'enabled'], dirtyFields, 'pluginsEnabled')
        ) {
          ensureMapInDoc(doc, ['plugins']);
          setBooleanInDoc(doc, ['plugins', 'enabled'], values.pluginsEnabled);
          deleteIfMapEmpty(doc, ['plugins']);
        }
        setBooleanInDoc(doc, ['logging-to-file'], values.loggingToFile);
        setIntFromStringInDoc(doc, ['logs-max-total-size-mb'], values.logsMaxTotalSizeMb);
        setIntFromStringInDoc(doc, ['error-logs-max-files'], values.errorLogsMaxFiles);
        setStringInDoc(doc, ['proxy-url'], values.proxyUrl);
        setBooleanInDoc(doc, ['force-model-prefix'], values.forceModelPrefix);
        if (
          shouldWriteManagedField(doc, ['image-fallback-model'], dirtyFields, 'imageFallbackModel')
        ) {
          setStringInDoc(doc, ['image-fallback-model'], values.imageFallbackModel);
        }
        setBooleanInDoc(doc, ['passthrough-headers'], values.passthroughHeaders);
        setBooleanInDoc(doc, ['hide-upstream-error-details'], values.hideUpstreamErrorDetails);
        setBooleanInDoc(doc, ['disable-claude-cloak-mode'], values.disableClaudeCloakMode);
        setBooleanInDoc(doc, ['experimental-cch-signing'], values.experimentalCCHSigning);
        setIntFromStringInDoc(doc, ['request-retry'], values.requestRetry);
        setIntFromStringInDoc(doc, ['max-retry-credentials'], values.maxRetryCredentials);
        setIntFromStringInDoc(doc, ['max-retry-interval'], values.maxRetryInterval);
        setBooleanInDoc(doc, ['disable-cooling'], values.disableCooling);
        setBooleanInDoc(doc, ['disable-auto-disable'], values.disableAutoDisable);
        setDisableImageGenerationInDoc(
          doc,
          ['disable-image-generation'],
          values.disableImageGeneration
        );
        setIntFromStringInDoc(doc, ['auth-auto-refresh-workers'], values.authAutoRefreshWorkers);
        setBooleanInDoc(doc, ['ws-auth'], values.wsAuth);
        setBooleanInDoc(doc, ['enable-gemini-cli-endpoint'], values.enableGeminiCliEndpoint);
        if (
          docHas(doc, ['antigravity-signature-cache-enabled']) ||
          !values.antigravitySignatureCacheEnabled
        ) {
          doc.setIn(
            ['antigravity-signature-cache-enabled'],
            values.antigravitySignatureCacheEnabled
          );
        }
        setBooleanInDoc(
          doc,
          ['antigravity-signature-bypass-strict'],
          values.antigravitySignatureBypassStrict
        );

        if (
          docHas(doc, ['claude-header-defaults']) ||
          values.claudeHeaderUserAgent.trim() ||
          values.claudeHeaderPackageVersion.trim() ||
          values.claudeHeaderRuntimeVersion.trim() ||
          values.claudeHeaderOs.trim() ||
          values.claudeHeaderArch.trim() ||
          values.claudeHeaderTimeout.trim() ||
          values.claudeHeaderStabilizeDeviceProfile
        ) {
          ensureMapInDoc(doc, ['claude-header-defaults']);
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'user-agent'],
            values.claudeHeaderUserAgent
          );
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'package-version'],
            values.claudeHeaderPackageVersion
          );
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'runtime-version'],
            values.claudeHeaderRuntimeVersion
          );
          setStringInDoc(doc, ['claude-header-defaults', 'os'], values.claudeHeaderOs);
          setStringInDoc(doc, ['claude-header-defaults', 'arch'], values.claudeHeaderArch);
          setStringInDoc(doc, ['claude-header-defaults', 'timeout'], values.claudeHeaderTimeout);
          setBooleanInDoc(
            doc,
            ['claude-header-defaults', 'stabilize-device-profile'],
            values.claudeHeaderStabilizeDeviceProfile
          );
          deleteIfMapEmpty(doc, ['claude-header-defaults']);
        }

        if (
          docHas(doc, ['codex-header-defaults']) ||
          values.codexHeaderUserAgent.trim() ||
          values.codexHeaderBetaFeatures.trim()
        ) {
          ensureMapInDoc(doc, ['codex-header-defaults']);
          setStringInDoc(doc, ['codex-header-defaults', 'user-agent'], values.codexHeaderUserAgent);
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'beta-features'],
            values.codexHeaderBetaFeatures
          );
          deleteIfMapEmpty(doc, ['codex-header-defaults']);
        }

        const codexIdentityConfusePath = ['codex', 'identity-confuse'];
        const codexIdentityConfuseLegacyPath = ['codex', 'identityConfuse'];
        if (
          docHas(doc, ['codex']) ||
          docHas(doc, codexIdentityConfuseLegacyPath) ||
          values.codexIdentityConfuse ||
          values.codexForceSuperCategory ||
          values.codexBugMode ||
          values.responsesCompactFallbackModel.trim() ||
          values.codexModelContextWindowOverrides.length > 0 ||
          dirtyFields.has('codexForceSuperCategory') ||
          dirtyFields.has('codexBugMode') ||
          dirtyFields.has('responsesCompactFallbackModel') ||
          dirtyFields.has('codexModelContextWindowOverrides') ||
          dirtyFields.has('codexIdentityConfuse')
        ) {
          ensureMapInDoc(doc, ['codex']);
          if (
            values.codexIdentityConfuse ||
            dirtyFields.has('codexIdentityConfuse') ||
            docHas(doc, codexIdentityConfusePath) ||
            docHas(doc, codexIdentityConfuseLegacyPath)
          ) {
            doc.setIn(codexIdentityConfusePath, values.codexIdentityConfuse);
          }
          if (docHas(doc, codexIdentityConfuseLegacyPath)) {
            doc.deleteIn(codexIdentityConfuseLegacyPath);
          }
          if (
            values.codexForceSuperCategory ||
            dirtyFields.has('codexForceSuperCategory') ||
            docHas(doc, ['codex', 'force-super-category'])
          ) {
            setBooleanInDoc(doc, ['codex', 'force-super-category'], values.codexForceSuperCategory);
          }
          if (
            values.codexBugMode ||
            dirtyFields.has('codexBugMode') ||
            docHas(doc, ['codex', 'bug-mode'])
          ) {
            setBooleanInDoc(doc, ['codex', 'bug-mode'], values.codexBugMode);
          }
          if (
            shouldWriteManagedField(
              doc,
              ['codex', 'responses-compact-fallback-model'],
              dirtyFields,
              'responsesCompactFallbackModel'
            )
          ) {
            setStringInDoc(
              doc,
              ['codex', 'responses-compact-fallback-model'],
              values.responsesCompactFallbackModel
            );
          }
          if (
            shouldWriteManagedField(
              doc,
              ['codex', 'model-context-window-overrides'],
              dirtyFields,
              'codexModelContextWindowOverrides'
            )
          ) {
            const overrides = serializeCodexModelContextWindowOverrides(
              values.codexModelContextWindowOverrides
            );
            if (Object.keys(overrides).length > 0) {
              doc.setIn(['codex', 'model-context-window-overrides'], overrides);
            } else if (docHas(doc, ['codex', 'model-context-window-overrides'])) {
              doc.deleteIn(['codex', 'model-context-window-overrides']);
            }
          }
          deleteIfMapEmpty(doc, ['codex']);
        }

        if (
          docHas(doc, ['quota-exceeded']) ||
          !values.quotaSwitchProject ||
          !values.quotaSwitchPreviewModel ||
          shouldWriteManagedField(
            doc,
            ['quota-exceeded', 'antigravity-credits'],
            dirtyFields,
            'quotaAntigravityCredits'
          )
        ) {
          ensureMapInDoc(doc, ['quota-exceeded']);
          const writeQuotaAntigravityCredits = shouldWriteManagedField(
            doc,
            ['quota-exceeded', 'antigravity-credits'],
            dirtyFields,
            'quotaAntigravityCredits'
          );
          doc.setIn(['quota-exceeded', 'switch-project'], values.quotaSwitchProject);
          doc.setIn(['quota-exceeded', 'switch-preview-model'], values.quotaSwitchPreviewModel);
          if (writeQuotaAntigravityCredits) {
            doc.setIn(['quota-exceeded', 'antigravity-credits'], values.quotaAntigravityCredits);
          }
          deleteIfMapEmpty(doc, ['quota-exceeded']);
        }

        if (
          docHas(doc, ['routing']) ||
          values.routingStrategy !== 'round-robin' ||
          values.routingSessionAffinity ||
          values.routingSessionAffinityTTL.trim()
        ) {
          ensureMapInDoc(doc, ['routing']);
          doc.setIn(['routing', 'strategy'], values.routingStrategy);
          setBooleanInDoc(doc, ['routing', 'session-affinity'], values.routingSessionAffinity);
          setStringInDoc(
            doc,
            ['routing', 'session-affinity-ttl'],
            values.routingSessionAffinityTTL
          );
          deleteIfMapEmpty(doc, ['routing']);
        }

        const shouldWriteAugment =
          docHas(doc, ['augment']) ||
          dirtyFields.has('augmentSilentModeModel') ||
          dirtyFields.has('augmentCodebaseRetrievalModel') ||
          dirtyFields.has('augmentUseConfiguredCompletionModels') ||
          dirtyFields.has('augmentCodeCompletionModel') ||
          dirtyFields.has('augmentChatInputCompletionModel') ||
          dirtyFields.has('augmentShowThinkingProgress');
        if (shouldWriteAugment) {
          ensureMapInDoc(doc, ['augment']);
          setStringInDoc(doc, ['augment', 'silent-mode-model'], values.augmentSilentModeModel);
          doc.deleteIn(['augment', 'image-fallback-model']);
          setStringInDoc(
            doc,
            ['augment', 'codebase-retrieval-model'],
            values.augmentCodebaseRetrievalModel
          );
          if (
            shouldWriteManagedField(
              doc,
              ['augment', 'use-configured-completion-models'],
              dirtyFields,
              'augmentUseConfiguredCompletionModels'
            )
          ) {
            doc.setIn(
              ['augment', 'use-configured-completion-models'],
              values.augmentUseConfiguredCompletionModels
            );
          }
          setStringInDoc(
            doc,
            ['augment', 'code-completion-model'],
            values.augmentCodeCompletionModel
          );
          setStringInDoc(
            doc,
            ['augment', 'chat-input-completion-model'],
            values.augmentChatInputCompletionModel
          );
          if (
            shouldWriteManagedField(
              doc,
              ['augment', 'show-thinking-progress'],
              dirtyFields,
              'augmentShowThinkingProgress'
            )
          ) {
            doc.setIn(['augment', 'show-thinking-progress'], values.augmentShowThinkingProgress);
          }
          deleteIfMapEmpty(doc, ['augment']);
        }

        const shouldWriteKiroPolicy =
          docHas(doc, ['kiro-request-policy']) ||
          dirtyFields.has('kiroPerAccountRpmLimit') ||
          dirtyFields.has('kiroFreeRpmLimit') ||
          dirtyFields.has('kiroProRpmLimit') ||
          dirtyFields.has('kiroCooldownStrategy') ||
          dirtyFields.has('kiroBaseCooldownSeconds') ||
          dirtyFields.has('kiroMaxCooldownSeconds') ||
          dirtyFields.has('kiroConsecutiveErrorCooldownThreshold') ||
          dirtyFields.has('kiroConsecutiveErrorDisableThreshold') ||
          dirtyFields.has('kiroInvalidAuthAutoDisable');
        if (shouldWriteKiroPolicy) {
          ensureMapInDoc(doc, ['kiro-request-policy']);
          setIntFromStringInDoc(
            doc,
            ['kiro-request-policy', 'per-account-rpm-limit'],
            values.kiroPerAccountRpmLimit
          );
          if (
            docHas(doc, ['kiro-request-policy', 'rpm-limits']) ||
            values.kiroFreeRpmLimit.trim() ||
            values.kiroProRpmLimit.trim() ||
            dirtyFields.has('kiroFreeRpmLimit') ||
            dirtyFields.has('kiroProRpmLimit')
          ) {
            ensureMapInDoc(doc, ['kiro-request-policy', 'rpm-limits']);
            setIntFromStringInDoc(
              doc,
              ['kiro-request-policy', 'rpm-limits', 'free'],
              values.kiroFreeRpmLimit
            );
            setIntFromStringInDoc(
              doc,
              ['kiro-request-policy', 'rpm-limits', 'pro'],
              values.kiroProRpmLimit
            );
            deleteIfMapEmpty(doc, ['kiro-request-policy', 'rpm-limits']);
          }
          doc.setIn(['kiro-request-policy', 'cooldown-strategy'], values.kiroCooldownStrategy);
          setIntFromStringInDoc(
            doc,
            ['kiro-request-policy', 'base-cooldown-seconds'],
            values.kiroBaseCooldownSeconds
          );
          setIntFromStringInDoc(
            doc,
            ['kiro-request-policy', 'max-cooldown-seconds'],
            values.kiroMaxCooldownSeconds
          );
          setIntFromStringInDoc(
            doc,
            ['kiro-request-policy', 'consecutive-error-cooldown-threshold'],
            values.kiroConsecutiveErrorCooldownThreshold
          );
          setIntFromStringInDoc(
            doc,
            ['kiro-request-policy', 'consecutive-error-disable-threshold'],
            values.kiroConsecutiveErrorDisableThreshold
          );
          doc.setIn(
            ['kiro-request-policy', 'invalid-auth-auto-disable'],
            values.kiroInvalidAuthAutoDisable
          );
          deleteIfMapEmpty(doc, ['kiro-request-policy']);
        }

        if (docHas(doc, ['usage-models']) || values.usageModels.length > 0) {
          const usageModels = serializeUsageModelsForYaml(values.usageModels);
          if (Object.keys(usageModels).length > 0) {
            doc.setIn(['usage-models'], usageModels);
          } else if (docHas(doc, ['usage-models'])) {
            doc.deleteIn(['usage-models']);
          }
        }

        const keepaliveSeconds =
          typeof values.streaming?.keepaliveSeconds === 'string'
            ? values.streaming.keepaliveSeconds
            : '';
        const bootstrapRetries =
          typeof values.streaming?.bootstrapRetries === 'string'
            ? values.streaming.bootstrapRetries
            : '';
        const nonstreamKeepaliveInterval =
          typeof values.streaming?.nonstreamKeepaliveInterval === 'string'
            ? values.streaming.nonstreamKeepaliveInterval
            : '';

        const streamingDefined =
          docHas(doc, ['streaming']) || keepaliveSeconds.trim() || bootstrapRetries.trim();
        if (streamingDefined) {
          ensureMapInDoc(doc, ['streaming']);
          setIntFromStringInDoc(doc, ['streaming', 'keepalive-seconds'], keepaliveSeconds);
          setIntFromStringInDoc(doc, ['streaming', 'bootstrap-retries'], bootstrapRetries);
          deleteIfMapEmpty(doc, ['streaming']);
        }

        setIntFromStringInDoc(doc, ['nonstream-keepalive-interval'], nonstreamKeepaliveInterval);

        if (
          docHas(doc, ['payload']) ||
          values.payloadDefaultRules.length > 0 ||
          values.payloadDefaultRawRules.length > 0 ||
          values.payloadOverrideRules.length > 0 ||
          values.payloadOverrideRawRules.length > 0 ||
          values.payloadFilterRules.length > 0
        ) {
          ensureMapInDoc(doc, ['payload']);
          if (values.payloadDefaultRules.length > 0) {
            doc.setIn(
              ['payload', 'default'],
              serializePayloadRulesForYaml(values.payloadDefaultRules)
            );
          } else if (docHas(doc, ['payload', 'default'])) {
            doc.deleteIn(['payload', 'default']);
          }
          if (values.payloadDefaultRawRules.length > 0) {
            doc.setIn(
              ['payload', 'default-raw'],
              serializeRawPayloadRulesForYaml(values.payloadDefaultRawRules)
            );
          } else if (docHas(doc, ['payload', 'default-raw'])) {
            doc.deleteIn(['payload', 'default-raw']);
          }
          if (values.payloadOverrideRules.length > 0) {
            doc.setIn(
              ['payload', 'override'],
              serializePayloadRulesForYaml(values.payloadOverrideRules)
            );
          } else if (docHas(doc, ['payload', 'override'])) {
            doc.deleteIn(['payload', 'override']);
          }
          if (values.payloadOverrideRawRules.length > 0) {
            doc.setIn(
              ['payload', 'override-raw'],
              serializeRawPayloadRulesForYaml(values.payloadOverrideRawRules)
            );
          } else if (docHas(doc, ['payload', 'override-raw'])) {
            doc.deleteIn(['payload', 'override-raw']);
          }
          if (values.payloadFilterRules.length > 0) {
            doc.setIn(
              ['payload', 'filter'],
              serializePayloadFilterRulesForYaml(values.payloadFilterRules)
            );
          } else if (docHas(doc, ['payload', 'filter'])) {
            doc.deleteIn(['payload', 'filter']);
          }
          deleteIfMapEmpty(doc, ['payload']);
        }

        return doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
      } catch {
        return currentYaml;
      }
    },
    [dirtyFields, visualValues]
  );

  const setVisualValues = useCallback((newValues: Partial<VisualConfigValues>) => {
    dispatch({ type: 'set_values', values: newValues });
  }, []);

  return {
    visualValues,
    visualDirty,
    visualParseError,
    visualValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  };
}

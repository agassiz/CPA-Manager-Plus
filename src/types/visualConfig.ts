export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type DisableImageGenerationMode = 'false' | 'true' | 'chat';
export type CodexIdentityMode = 'off' | 'confuse' | 'device' | 'full';
export const CODEX_IDENTITY_MODES: CodexIdentityMode[] = [
  'off',
  'confuse',
  'device',
  'full',
];
export type APIKeyAccessRuleConfig = {
  apiKey: string;
  models: string[];
  authIds: string[];
  providers: string[];
};
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'maxRequestBodyMb'
  | 'errorLogsMaxFiles'
  | 'logsMaxTotalSizeMb'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'authAutoRefreshWorkers'
  | 'codexModelContextWindowOverrides'
  | 'kiroPerAccountRpmLimit'
  | 'kiroFreeRpmLimit'
  | 'kiroProRpmLimit'
  | 'kiroBaseCooldownSeconds'
  | 'kiroMaxCooldownSeconds'
  | 'kiroConsecutiveErrorCooldownThreshold'
  | 'kiroConsecutiveErrorDisableThreshold'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'non_negative_integer'
  | 'invalid_context_window_overrides';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadHeaderEntry = {
  id: string;
  name: string;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
  fromProtocol?: string;
  headers?: PayloadHeaderEntry[];
  match?: PayloadParamEntry[];
  notMatch?: PayloadParamEntry[];
  exist?: string[];
  notExist?: string[];
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export type UsageModelEntry = {
  id: string;
  name: string;
  displayName: string;
  shortName: string;
  description: string;
  disabled: boolean;
  isNew: boolean;
  isDefault: boolean;
  isLegacyModel: boolean;
  modelGroupPriority: number;
  priority: number;
  historySummaryOverrides: string;
  extra: Record<string, unknown>;
};

export type CodexContextWindowOverride = {
  id: string;
  model: string;
  contextWindow: string;
};

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmDisableAutoUpdatePanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  apiKeyAccessRules: APIKeyAccessRuleConfig[];
  debug: boolean;
  commercialMode: boolean;
  pluginsEnabled: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  maxRequestBodyMb: string;
  proxyUrl: string;
  forceModelPrefix: boolean;
  imageFallbackModel: string;
  responsesCompactFallbackModel: string;
  codexModelContextWindowOverrides: CodexContextWindowOverride[];
  codexForceSuperCategory: boolean;
  codexBugMode: boolean;
  passthroughHeaders: boolean;
  hideUpstreamErrorDetails: boolean;
  disableClaudeCloakMode: boolean;
  experimentalCCHSigning: boolean;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  disableCooling: boolean;
  disableAutoDisable: boolean;
  disableImageGeneration: DisableImageGenerationMode;
  authAutoRefreshWorkers: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  routingStrategy: 'round-robin' | 'fill-first';
  routingSessionAffinity: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  enableGeminiCliEndpoint: boolean;
  antigravitySignatureCacheEnabled: boolean;
  antigravitySignatureBypassStrict: boolean;
  claudeHeaderUserAgent: string;
  claudeHeaderPackageVersion: string;
  claudeHeaderRuntimeVersion: string;
  claudeHeaderOs: string;
  claudeHeaderArch: string;
  claudeHeaderTimeout: string;
  claudeHeaderStabilizeDeviceProfile: boolean;
  codexHeaderUserAgent: string;
  codexHeaderBetaFeatures: string;
  codexIdentityMode: CodexIdentityMode;
  augmentSilentModeModel: string;
  augmentCodebaseRetrievalModel: string;
  augmentUseConfiguredCompletionModels: boolean;
  augmentCodeCompletionModel: string;
  augmentChatInputCompletionModel: string;
  augmentShowThinkingProgress: boolean;
  kiroPerAccountRpmLimit: string;
  kiroFreeRpmLimit: string;
  kiroProRpmLimit: string;
  kiroCooldownStrategy: 'linear' | 'fixed' | 'exponential';
  kiroBaseCooldownSeconds: string;
  kiroMaxCooldownSeconds: string;
  kiroConsecutiveErrorCooldownThreshold: string;
  kiroConsecutiveErrorDisableThreshold: string;
  kiroInvalidAuthAutoDisable: boolean;
  usageModels: UsageModelEntry[];
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmDisableAutoUpdatePanel: false,
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  apiKeyAccessRules: [],
  debug: false,
  commercialMode: false,
  pluginsEnabled: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  errorLogsMaxFiles: '',
  maxRequestBodyMb: '',
  proxyUrl: '',
  forceModelPrefix: false,
  imageFallbackModel: '',
  responsesCompactFallbackModel: '',
  codexModelContextWindowOverrides: [],
  codexForceSuperCategory: false,
  codexBugMode: false,
  passthroughHeaders: false,
  hideUpstreamErrorDetails: false,
  disableClaudeCloakMode: false,
  experimentalCCHSigning: false,
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  disableCooling: false,
  disableAutoDisable: false,
  disableImageGeneration: 'false',
  authAutoRefreshWorkers: '',
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAntigravityCredits: false,
  routingStrategy: 'round-robin',
  routingSessionAffinity: false,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  enableGeminiCliEndpoint: false,
  antigravitySignatureCacheEnabled: true,
  antigravitySignatureBypassStrict: false,
  claudeHeaderUserAgent: '',
  claudeHeaderPackageVersion: '',
  claudeHeaderRuntimeVersion: '',
  claudeHeaderOs: '',
  claudeHeaderArch: '',
  claudeHeaderTimeout: '',
  claudeHeaderStabilizeDeviceProfile: false,
  codexHeaderUserAgent: '',
  codexHeaderBetaFeatures: '',
  codexIdentityMode: 'off',
  augmentSilentModeModel: '',
  augmentCodebaseRetrievalModel: '',
  augmentUseConfiguredCompletionModels: false,
  augmentCodeCompletionModel: '',
  augmentChatInputCompletionModel: '',
  augmentShowThinkingProgress: false,
  kiroPerAccountRpmLimit: '20',
  kiroFreeRpmLimit: '',
  kiroProRpmLimit: '',
  kiroCooldownStrategy: 'linear',
  kiroBaseCooldownSeconds: '300',
  kiroMaxCooldownSeconds: '1800',
  kiroConsecutiveErrorCooldownThreshold: '5',
  kiroConsecutiveErrorDisableThreshold: '20',
  kiroInvalidAuthAutoDisable: true,
  usageModels: [],
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
};

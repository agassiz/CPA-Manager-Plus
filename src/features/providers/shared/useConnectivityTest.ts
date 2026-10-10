import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiCallErrorMessage, providersApi, type ApiCallResult } from '@/services/api';
import { buildHeaderObject, hasHeader } from '@/utils/headers';
import { getErrorMessage } from '@/utils/helpers';
import type { ProviderKeyConfig } from '@/types';
import type { ApiKeyEntryInput, ModelEntryInput, ProviderBrand } from '../types';

const DEFAULT_TIMEOUT_MS = 30_000;

export type ConnectivityState = 'idle' | 'loading' | 'success' | 'error';

export interface ConnectivityStatus {
  state: ConnectivityState;
  message: string;
}

const IDLE: ConnectivityStatus = { state: 'idle', message: '' };

const requestFailureMessage = (err: unknown, messages: ConnectivityErrorMessages): string => {
  const raw = getErrorMessage(err);
  const isTimeout =
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      String((err as { code?: string }).code) === 'ECONNABORTED') ||
    raw.toLowerCase().includes('timeout');

  return isTimeout ? messages.timeout(DEFAULT_TIMEOUT_MS / 1000) : raw || messages.requestFailed;
};

const pickModel = (testModel: string | undefined, models: ModelEntryInput[]): string => {
  const trimmed = (testModel ?? '').trim();
  if (trimmed) return trimmed;
  for (const m of models) {
    const name = (m.name ?? '').trim();
    if (name) return name;
  }
  return '';
};

export interface UseConnectivityTestArgs {
  brand: ProviderBrand;
  baseUrl: string;
  testModel?: string;
  models: ModelEntryInput[];
  formHeaders: Array<{ key: string; value: string }>;
  apiKeyEntries?: ApiKeyEntryInput[];
  apiKey?: string;
  fallbackApiKey?: string;
  proxyUrl?: string;
  /** OpenAI-compatible provider name, used to match the saved provider. */
  providerName?: string;
  chatCompletionsOnly?: boolean;
}

export interface ConnectivityErrorMessages {
  baseUrlRequired: string;
  endpointInvalid: string;
  apiKeyRequired: string;
  modelRequired: string;
  timeout: (seconds: number) => string;
  requestFailed: string;
}

export interface UseConnectivityTestResult {
  openaiStatuses: ConnectivityStatus[];
  codexStatus: ConnectivityStatus;
  geminiStatus: ConnectivityStatus;
  claudeStatus: ConnectivityStatus;
  isTestingAny: boolean;
  runOpenAIKey: (idx: number) => Promise<boolean>;
  runOpenAIAllKeys: () => Promise<void>;
  runCodex: () => Promise<void>;
  runGemini: () => Promise<void>;
  runClaude: () => Promise<void>;
}

export function useConnectivityTest(
  args: UseConnectivityTestArgs,
  messages: ConnectivityErrorMessages
): UseConnectivityTestResult {
  const {
    brand,
    baseUrl,
    testModel,
    models,
    formHeaders,
    apiKeyEntries,
    apiKey,
    fallbackApiKey,
    proxyUrl,
    providerName,
    chatCompletionsOnly,
  } = args;

  const entriesCount = apiKeyEntries?.length ?? 0;

  const [openaiStatuses, setOpenaiStatuses] = useState<ConnectivityStatus[]>(() =>
    Array.from({ length: entriesCount }, () => IDLE)
  );
  const [codexStatus, setCodexStatus] = useState<ConnectivityStatus>(IDLE);
  const [geminiStatus, setGeminiStatus] = useState<ConnectivityStatus>(IDLE);
  const [claudeStatus, setClaudeStatus] = useState<ConnectivityStatus>(IDLE);
  const [inFlight, setInFlight] = useState(0);

  const entrySignatures = useMemo(
    () =>
      (apiKeyEntries ?? []).map((entry) =>
        [
          entry.apiKey ?? '',
          entry.existingApiKey ?? '',
          entry.proxyUrl ?? '',
        ].join('||')
      ),
    [apiKeyEntries]
  );

  const lastEntrySignaturesRef = useRef<string[]>(entrySignatures);
  useEffect(() => {
    const prev = lastEntrySignaturesRef.current;
    const curr = entrySignatures;
    lastEntrySignaturesRef.current = curr;

    setOpenaiStatuses((statuses) => {
      const nextLen = curr.length;
      let mutated = statuses.length !== nextLen;
      const next = statuses.slice(0, nextLen);
      while (next.length < nextLen) next.push(IDLE);
      for (let i = 0; i < nextLen; i++) {
        if (prev[i] !== undefined && prev[i] !== curr[i] && next[i].state !== 'idle') {
          next[i] = IDLE;
          mutated = true;
        }
      }
      return mutated ? next : statuses;
    });
  }, [entrySignatures]);

  const signature = useMemo(() => {
    const h = formHeaders.map((it) => `${it.key}:${it.value}`).join('|');
    const m = models.map((it) => `${it.name}:${it.alias ?? ''}`).join('|');
    return [
      baseUrl,
      (testModel ?? '').trim(),
      apiKey ?? '',
      fallbackApiKey ?? '',
      proxyUrl ?? '',
      providerName ?? '',
      chatCompletionsOnly ? 'chat' : 'responses',
      h,
      m,
    ].join('||');
  }, [
    apiKey,
    baseUrl,
    chatCompletionsOnly,
    fallbackApiKey,
    proxyUrl,
    providerName,
    testModel,
    formHeaders,
    models,
  ]);

  const lastSignatureRef = useRef(signature);
  useEffect(() => {
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    setOpenaiStatuses((prev) => prev.map(() => IDLE));
    setCodexStatus(IDLE);
    setGeminiStatus(IDLE);
    setClaudeStatus(IDLE);
  }, [signature]);

  const updateOpenaiStatus = useCallback((idx: number, value: ConnectivityStatus) => {
    setOpenaiStatuses((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }, []);

  // Every test runs through the backend provider executor, so the minimal test
  // request is shaped exactly like live traffic for that provider.
  const runTest = useCallback(
    async (
      setStatus: (status: ConnectivityStatus) => void,
      request: () => Promise<ApiCallResult>
    ): Promise<boolean> => {
      setStatus({ state: 'loading', message: '' });
      setInFlight((n) => n + 1);
      try {
        const result = await request();
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error(getApiCallErrorMessage(result));
        }
        setStatus({ state: 'success', message: '' });
        return true;
      } catch (err) {
        setStatus({ state: 'error', message: requestFailureMessage(err, messages) });
        return false;
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [messages]
  );

  const runOpenAIKey = useCallback(
    async (idx: number): Promise<boolean> => {
      if (brand !== 'openaiCompatibility') return false;
      const setStatus = (status: ConnectivityStatus) => updateOpenaiStatus(idx, status);

      const trimmedBase = baseUrl.trim();
      if (!trimmedBase) {
        setStatus({ state: 'error', message: messages.baseUrlRequired });
        return false;
      }
      const entry = apiKeyEntries?.[idx];
      const entryKey = (entry?.apiKey ?? '').trim() || (entry?.existingApiKey ?? '').trim();
      if (!entryKey) {
        setStatus({ state: 'error', message: messages.apiKeyRequired });
        return false;
      }
      const model = pickModel(testModel, models);
      if (!model) {
        setStatus({ state: 'error', message: messages.modelRequired });
        return false;
      }

      return runTest(setStatus, () =>
        providersApi.testOpenAIProviderConfig(
          {
            name: (providerName ?? '').trim(),
            baseUrl: trimmedBase,
            apiKeyEntries: [
              { apiKey: entryKey, proxyUrl: (entry?.proxyUrl ?? '').trim() || undefined },
            ],
            headers: buildHeaderObject(formHeaders),
            chatCompletionsOnly,
          },
          model,
          { timeout: DEFAULT_TIMEOUT_MS }
        )
      );
    },
    [
      apiKeyEntries,
      baseUrl,
      brand,
      chatCompletionsOnly,
      formHeaders,
      messages,
      models,
      providerName,
      runTest,
      testModel,
      updateOpenaiStatus,
    ]
  );

  const runOpenAIAllKeys = useCallback(async (): Promise<void> => {
    if (brand !== 'openaiCompatibility') return;
    const entries = apiKeyEntries ?? [];
    if (!entries.length) return;
    await Promise.all(entries.map((_, idx) => runOpenAIKey(idx)));
  }, [apiKeyEntries, brand, runOpenAIKey]);

  // Resolves the single-key entry under test, or reports why it cannot run.
  const resolveSingleKeyTest = useCallback(
    (
      setStatus: (status: ConnectivityStatus) => void,
      authHeaders: string[],
      requireBaseUrl: boolean
    ): { config: ProviderKeyConfig; model: string } | null => {
      const trimmedBase = baseUrl.trim();
      if (requireBaseUrl && !trimmedBase) {
        setStatus({ state: 'error', message: messages.baseUrlRequired });
        return null;
      }
      const model = pickModel(testModel, models);
      if (!model) {
        setStatus({ state: 'error', message: messages.modelRequired });
        return null;
      }
      const headers = buildHeaderObject(formHeaders);
      const resolvedKey = (apiKey ?? '').trim() || (fallbackApiKey ?? '').trim();
      if (!resolvedKey && !authHeaders.some((name) => hasHeader(headers, name))) {
        setStatus({ state: 'error', message: messages.apiKeyRequired });
        return null;
      }
      return {
        config: {
          apiKey: resolvedKey,
          baseUrl: trimmedBase || undefined,
          proxyUrl: (proxyUrl ?? '').trim() || undefined,
          headers,
        },
        model,
      };
    },
    [apiKey, baseUrl, fallbackApiKey, formHeaders, messages, models, proxyUrl, testModel]
  );

  const runCodex = useCallback(async (): Promise<void> => {
    if (brand !== 'codex' && brand !== 'xai') return;
    const resolved = resolveSingleKeyTest(setCodexStatus, ['authorization'], true);
    if (!resolved) return;
    await runTest(setCodexStatus, () =>
      providersApi.testProviderKeyConfig(
        brand === 'xai' ? 'xai-api-key' : 'codex-api-key',
        resolved.config,
        resolved.model,
        { timeout: DEFAULT_TIMEOUT_MS }
      )
    );
  }, [brand, resolveSingleKeyTest, runTest]);

  const runGemini = useCallback(async (): Promise<void> => {
    if (brand !== 'gemini') return;
    const resolved = resolveSingleKeyTest(setGeminiStatus, ['x-goog-api-key'], false);
    if (!resolved) return;
    await runTest(setGeminiStatus, () =>
      providersApi.testGeminiConfig(resolved.config, resolved.model, {
        timeout: DEFAULT_TIMEOUT_MS,
      })
    );
  }, [brand, resolveSingleKeyTest, runTest]);

  const runClaude = useCallback(async (): Promise<void> => {
    if (brand !== 'claude') return;
    const resolved = resolveSingleKeyTest(setClaudeStatus, ['x-api-key', 'authorization'], false);
    if (!resolved) return;
    await runTest(setClaudeStatus, () =>
      providersApi.testProviderKeyConfig('claude-api-key', resolved.config, resolved.model, {
        timeout: DEFAULT_TIMEOUT_MS,
      })
    );
  }, [brand, resolveSingleKeyTest, runTest]);

  return {
    openaiStatuses,
    codexStatus,
    geminiStatus,
    claudeStatus,
    isTestingAny: inFlight > 0,
    runOpenAIKey,
    runOpenAIAllKeys,
    runCodex,
    runGemini,
    runClaude,
  };
}

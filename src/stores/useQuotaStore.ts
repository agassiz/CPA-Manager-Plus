/**
 * Quota cache that survives route switches.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  DevinQuotaState,
  GeminiCliQuotaState,
  KiroQuotaState,
  KimiQuotaState,
  MetaQuotaState,
  XaiQuotaState,
} from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  cacheScope: string;
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  devinQuota: Record<string, DevinQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kiroQuota: Record<string, KiroQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  metaQuota: Record<string, MetaQuotaState>;
  xaiQuota: Record<string, XaiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setDevinQuota: (updater: QuotaUpdater<Record<string, DevinQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, KiroQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setMetaQuota: (updater: QuotaUpdater<Record<string, MetaQuotaState>>) => void;
  setXaiQuota: (updater: QuotaUpdater<Record<string, XaiQuotaState>>) => void;
  activateQuotaCacheScope: (scope: string) => void;
  clearQuotaCache: () => void;
}

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

const emptyQuotaState = {
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  devinQuota: {},
  geminiCliQuota: {},
  kiroQuota: {},
  kimiQuota: {},
  metaQuota: {},
  xaiQuota: {},
};

const persistSuccessfulQuota = <T extends { status: string }>(items: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(items).filter(
      ([, item]) => item?.status === 'success' && !('observedFromUsageHeaders' in item)
    )
  ) as Record<string, T>;

export const useQuotaStore = create<QuotaStoreState>()(
  persist(
    (set) => ({
      cacheScope: '',
      ...emptyQuotaState,
      setAntigravityQuota: (updater) =>
        set((state) => ({ antigravityQuota: resolveUpdater(updater, state.antigravityQuota) })),
      setClaudeQuota: (updater) =>
        set((state) => ({ claudeQuota: resolveUpdater(updater, state.claudeQuota) })),
      setCodexQuota: (updater) =>
        set((state) => ({ codexQuota: resolveUpdater(updater, state.codexQuota) })),
      setDevinQuota: (updater) =>
        set((state) => ({ devinQuota: resolveUpdater(updater, state.devinQuota) })),
      setGeminiCliQuota: (updater) =>
        set((state) => ({ geminiCliQuota: resolveUpdater(updater, state.geminiCliQuota) })),
      setKiroQuota: (updater) =>
        set((state) => ({ kiroQuota: resolveUpdater(updater, state.kiroQuota) })),
      setKimiQuota: (updater) =>
        set((state) => ({ kimiQuota: resolveUpdater(updater, state.kimiQuota) })),
      setMetaQuota: (updater) =>
        set((state) => ({ metaQuota: resolveUpdater(updater, state.metaQuota) })),
      setXaiQuota: (updater) =>
        set((state) => ({ xaiQuota: resolveUpdater(updater, state.xaiQuota) })),
      activateQuotaCacheScope: (scope) =>
        set((state) => {
          const nextScope = scope.trim();
          return state.cacheScope === nextScope
            ? state
            : { ...state, cacheScope: nextScope, ...emptyQuotaState };
        }),
      clearQuotaCache: () => set((state) => ({ ...state, ...emptyQuotaState })),
    }),
    {
      name: 'cli-proxy-quota-cache',
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          if (typeof localStorage === 'undefined') return null;
          const data = obfuscatedStorage.getItem(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          if (typeof localStorage !== 'undefined')
            obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => obfuscatedStorage.removeItem(name),
      })),
      partialize: (state) => ({
        cacheScope: state.cacheScope,
        antigravityQuota: persistSuccessfulQuota(state.antigravityQuota),
        claudeQuota: persistSuccessfulQuota(state.claudeQuota),
        codexQuota: persistSuccessfulQuota(state.codexQuota),
        devinQuota: persistSuccessfulQuota(state.devinQuota),
        geminiCliQuota: persistSuccessfulQuota(state.geminiCliQuota),
        kiroQuota: persistSuccessfulQuota(state.kiroQuota),
        kimiQuota: persistSuccessfulQuota(state.kimiQuota),
        metaQuota: persistSuccessfulQuota(state.metaQuota),
        xaiQuota: persistSuccessfulQuota(state.xaiQuota),
      }),
    }
  )
);

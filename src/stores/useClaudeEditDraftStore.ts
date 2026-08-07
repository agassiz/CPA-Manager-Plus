/**
 * Claude provider editor draft state.
 *
 * Why this exists:
 * - The app uses `PageTransition` with iOS-style stacked routes for `/ai-providers/*`.
 * - Entering `/ai-providers/claude/.../models` creates a new route layer, so component-local state
 *   inside the Claude edit layout is not shared between the edit screen and the model picker screen.
 * - This store makes the Claude edit draft shared across route layers keyed by provider index/new.
 */

import type { SetStateAction } from 'react';
import { create } from 'zustand';
import type { ProviderFormState } from '@/components/providers/types';

export type ClaudeTestStatus = 'idle' | 'loading' | 'success' | 'error';

export type ClaudeCloakBaseline = {
  mode: string;
  strictMode: boolean;
  sensitiveWords: string[] | null;
  cacheUserID: boolean;
} | null;

export type ClaudeEditBaseline = {
  name: string;
  apiKey: string;
  priority: number | null;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  headers: Array<{ key: string; value: string }>;
  models: Array<{ name: string; alias: string }>;
  excludedModels: string[];
  disableCooling: boolean;
  cloak: ClaudeCloakBaseline;
  experimentalCCHSigning: boolean;
};

type ClaudeEditDraft = {
  initialized: boolean;
  baseline: ClaudeEditBaseline | null;
  form: ProviderFormState;
  testModel: string;
  testStatus: ClaudeTestStatus;
  testMessage: string;
};

interface ClaudeEditDraftState {
  drafts: Record<string, ClaudeEditDraft>;
  refCounts: Record<string, number>;
  acquireDraft: (key: string) => void;
  releaseDraft: (key: string) => void;
  ensureDraft: (key: string) => void;
  initDraft: (key: string, draft: Omit<ClaudeEditDraft, 'initialized'>) => void;
  setDraftBaseline: (key: string, baseline: ClaudeEditBaseline) => void;
  setDraftForm: (key: string, action: SetStateAction<ProviderFormState>) => void;
  setDraftTestModel: (key: string, action: SetStateAction<string>) => void;
  setDraftTestStatus: (key: string, action: SetStateAction<ClaudeTestStatus>) => void;
  setDraftTestMessage: (key: string, action: SetStateAction<string>) => void;
  clearDraft: (key: string) => void;
}

const resolveAction = <T>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (previous: T) => T)(prev) : action;

const buildEmptyForm = (): ProviderFormState => ({
  name: '',
  apiKey: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  disableCooling: false,
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
  experimentalCCHSigning: false,
  cloak: {
    mode: 'never',
    strictMode: false,
    sensitiveWords: [],
    cacheUserID: true,
  },
});

const buildEmptyDraft = (): ClaudeEditDraft => ({
  initialized: false,
  baseline: null,
  form: buildEmptyForm(),
  testModel: '',
  testStatus: 'idle',
  testMessage: '',
});

// The editor and `/models` route can be replaced in the same navigation turn. Keep the draft
// until the next task so the new route layer can acquire it before it is discarded.
const pendingReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useClaudeEditDraftStore = create<ClaudeEditDraftState>((set, get) => ({
  drafts: {},
  refCounts: {},

  acquireDraft: (key) => {
    if (!key) return;
    const pendingReleaseTimer = pendingReleaseTimers.get(key);
    if (pendingReleaseTimer !== undefined) {
      clearTimeout(pendingReleaseTimer);
      pendingReleaseTimers.delete(key);
    }
    set((state) => {
      const existingDraft = state.drafts[key];
      const currentCount = state.refCounts[key] ?? 0;
      return {
        drafts: existingDraft ? state.drafts : { ...state.drafts, [key]: buildEmptyDraft() },
        refCounts: { ...state.refCounts, [key]: currentCount + 1 },
      };
    });
  },

  releaseDraft: (key) => {
    if (!key) return;
    set((state) => {
      const currentCount = state.refCounts[key];
      if (!currentCount) return state;
      if (currentCount > 1) {
        return { refCounts: { ...state.refCounts, [key]: currentCount - 1 } };
      }
      const nextCounts = { ...state.refCounts };
      delete nextCounts[key];
      const timer = setTimeout(() => {
        pendingReleaseTimers.delete(key);
        set((state) => {
          if (state.refCounts[key]) return state;
          const nextDrafts = { ...state.drafts };
          delete nextDrafts[key];
          return { drafts: nextDrafts };
        });
      }, 0);
      pendingReleaseTimers.set(key, timer);
      return { refCounts: nextCounts };
    });
  },

  ensureDraft: (key) => {
    if (!key) return;
    const existing = get().drafts[key];
    if (existing) return;
    set((state) => ({
      drafts: { ...state.drafts, [key]: buildEmptyDraft() },
    }));
  },

  initDraft: (key, draft) => {
    if (!key) return;
    const existing = get().drafts[key];
    if (existing?.initialized) return;
    set((state) => ({
      drafts: {
        ...state.drafts,
        [key]: { ...draft, initialized: true },
      },
    }));
  },

  setDraftBaseline: (key, baseline) => {
    if (!key) return;
    set((state) => {
      const existing = state.drafts[key] ?? buildEmptyDraft();
      return {
        drafts: {
          ...state.drafts,
          [key]: { ...existing, initialized: true, baseline },
        },
      };
    });
  },

  setDraftForm: (key, action) => {
    if (!key) return;
    set((state) => {
      const existing = state.drafts[key] ?? buildEmptyDraft();
      const nextForm = resolveAction(action, existing.form);
      return {
        drafts: {
          ...state.drafts,
          [key]: { ...existing, initialized: true, form: nextForm },
        },
      };
    });
  },

  setDraftTestModel: (key, action) => {
    if (!key) return;
    set((state) => {
      const existing = state.drafts[key] ?? buildEmptyDraft();
      const nextValue = resolveAction(action, existing.testModel);
      return {
        drafts: {
          ...state.drafts,
          [key]: { ...existing, initialized: true, testModel: nextValue },
        },
      };
    });
  },

  setDraftTestStatus: (key, action) => {
    if (!key) return;
    set((state) => {
      const existing = state.drafts[key] ?? buildEmptyDraft();
      const nextValue = resolveAction(action, existing.testStatus);
      return {
        drafts: {
          ...state.drafts,
          [key]: { ...existing, initialized: true, testStatus: nextValue },
        },
      };
    });
  },

  setDraftTestMessage: (key, action) => {
    if (!key) return;
    set((state) => {
      const existing = state.drafts[key] ?? buildEmptyDraft();
      const nextValue = resolveAction(action, existing.testMessage);
      return {
        drafts: {
          ...state.drafts,
          [key]: { ...existing, initialized: true, testMessage: nextValue },
        },
      };
    });
  },

  clearDraft: (key) => {
    if (!key) return;
    const pendingReleaseTimer = pendingReleaseTimers.get(key);
    if (pendingReleaseTimer !== undefined) {
      clearTimeout(pendingReleaseTimer);
      pendingReleaseTimers.delete(key);
    }
    set((state) => {
      if (!state.drafts[key] && !state.refCounts[key]) return state;
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[key];
      const nextCounts = { ...state.refCounts };
      delete nextCounts[key];
      return { drafts: nextDrafts, refCounts: nextCounts };
    });
  },
}));

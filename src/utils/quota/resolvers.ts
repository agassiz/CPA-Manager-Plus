/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import {
  normalizeStringValue,
  normalizePlanType,
  parseIdTokenPayload
} from './parsers';

const CODEX_PLAN_FILENAME_PATTERN = /(?:^|[-_])(pro[-_]?lite|prolite|pro|plus|team|free)$/i;

const resolveAccountIdCandidate = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return normalizeStringValue(
    record.chatgpt_account_id ??
      record.chatgptAccountId ??
      record.account_id ??
      record.accountId
  );
};

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const direct = resolveAccountIdCandidate(value);
  if (direct) return direct;

  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return normalizeStringValue(
    payload.chatgpt_account_id ??
      payload.chatgptAccountId ??
      payload.account_id ??
      payload.accountId
  );
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file.account_id,
    file.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    metadata?.account_id,
    metadata?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId,
    file.id_token,
    metadata?.id_token,
    attributes?.id_token,
  ];

  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const idToken =
    file && typeof file.id_token === 'object' && file.id_token !== null
      ? (file.id_token as Record<string, unknown>)
      : null;
  const metadataIdToken =
    metadata && typeof metadata.id_token === 'object' && metadata.id_token !== null
      ? (metadata.id_token as Record<string, unknown>)
      : null;
  const resolveIdTokenPlanCandidate = (value: unknown): string | null => {
    const payload = parseIdTokenPayload(value);
    if (!payload) return null;
    return normalizePlanType(payload.plan_type ?? payload.planType);
  };
  const resolveFilenamePlanCandidate = (value: unknown): string | null => {
    const filename = normalizeStringValue(value);
    if (!filename) return null;
    const basename = filename.replace(/\.[^.]+$/, '');
    const match = basename.match(CODEX_PLAN_FILENAME_PATTERN);
    return match?.[1] ? normalizePlanType(match[1]) : null;
  };
  const candidates = [
    file.plan_type,
    file.planType,
    file['plan_type'],
    file['planType'],
    resolveIdTokenPlanCandidate(file.id_token),
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan_type,
    metadata?.planType,
    resolveIdTokenPlanCandidate(metadata?.id_token),
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    attributes?.plan_type,
    attributes?.planType,
    resolveIdTokenPlanCandidate(attributes?.id_token),
    resolveFilenamePlanCandidate(file.name)
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.account,
    file['account'],
    metadata?.account,
    attributes?.account
  ];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}

export function preserveQuotaSortMetadata<T>(
  quotaType: string,
  previousState: unknown,
  nextState: T
): T {
  if (
    !previousState ||
    typeof previousState !== 'object' ||
    Array.isArray(previousState) ||
    !nextState ||
    typeof nextState !== 'object' ||
    Array.isArray(nextState)
  ) {
    return nextState;
  }

  const prevRecord = previousState as Record<string, unknown>;
  const nextRecord = nextState as Record<string, unknown>;

  if (quotaType === 'codex') {
    const nextPlanType = nextRecord.planType;
    const prevPlanType = prevRecord.planType;
    if (
      (typeof nextPlanType !== 'string' || !nextPlanType.trim()) &&
      typeof prevPlanType === 'string' &&
      prevPlanType.trim()
    ) {
      return { ...nextRecord, planType: prevPlanType } as T;
    }
    return nextState;
  }

  if (quotaType === 'antigravity') {
    const patch: Record<string, unknown> = {};
    const nextTierId = nextRecord.tierId;
    const prevTierId = prevRecord.tierId;
    if (
      (typeof nextTierId !== 'string' || !nextTierId.trim()) &&
      typeof prevTierId === 'string' &&
      prevTierId.trim()
    ) {
      patch.tierId = prevTierId;
    }

    const nextStatus = nextRecord.status;
    if (
      (nextStatus === 'loading' || nextStatus === 'error') &&
      (nextRecord.creditBalance === undefined || nextRecord.creditBalance === null) &&
      typeof prevRecord.creditBalance === 'number' &&
      Number.isFinite(prevRecord.creditBalance)
    ) {
      patch.creditBalance = prevRecord.creditBalance;
    }

    if (Object.keys(patch).length > 0) {
      return { ...nextRecord, ...patch } as T;
    }
  }

  return nextState;
}

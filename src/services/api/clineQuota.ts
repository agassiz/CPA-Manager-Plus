import type { ClineBalance } from '@/types';

const MICRO_USD_PER_USD = 1_000_000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Cline wraps every response as `{ success: true, data: ... }`. */
const readClineEnvelopeData = (payload: unknown): Record<string, unknown> | null => {
  let parsed = payload;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const envelope = asRecord(parsed);
  if (!envelope || envelope.success !== true) return null;
  return asRecord(envelope.data);
};

/** Reads the account id from `GET /api/v1/users/me`. */
export function readClineUserId(payload: unknown): string | null {
  const id = readClineEnvelopeData(payload)?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** Reads the credit balance from `GET /api/v1/users/{id}/balance` (millionths of a dollar). */
export function readClineBalance(payload: unknown): ClineBalance | null {
  const balance = readClineEnvelopeData(payload)?.balance;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  return { balanceMicroUsd: balance };
}

/** Formats a credit balance like the Cline dashboard, keeping cents-level precision below $1. */
export function formatClineCredits(balance: ClineBalance | null): string {
  if (!balance) return '--';
  const usd = balance.balanceMicroUsd / MICRO_USD_PER_USD;
  return `$${usd.toFixed(Math.abs(usd) < 1 ? 4 : 2)}`;
}

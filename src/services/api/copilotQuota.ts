import type { CopilotQuotaData } from '@/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Reads the premium interactions snapshot from `GET /copilot_internal/user`.
 * Missing, unlimited or malformed snapshots return null instead of an exhausted quota.
 */
export function parseCopilotQuota(body: unknown): CopilotQuotaData | null {
  if (!isRecord(body) || !isRecord(body.quota_snapshots)) return null;
  const premium = body.quota_snapshots.premium_interactions;
  if (!isRecord(premium) || premium.has_quota === false || premium.unlimited === true) return null;
  const { quota_remaining: remaining, entitlement, percent_remaining: percentRemaining } = premium;
  if (
    !isAmount(remaining) ||
    !isAmount(entitlement) ||
    !isAmount(percentRemaining) ||
    percentRemaining > 100
  ) {
    return null;
  }
  return { remaining, entitlement, percentRemaining };
}

import { apiClient } from './client';

export type UsageCounterSnapshotResponse = {
  success: boolean;
  updated?: number;
  removed?: number;
};

const normalizeAuthIndices = (authIndices: ReadonlyArray<string>): string[] =>
  Array.from(new Set(authIndices.map((authIndex) => authIndex.trim()).filter(Boolean)));

export const usageCounterSnapshotsApi = {
  reset: (authIndices: ReadonlyArray<string>) =>
    apiClient.post<UsageCounterSnapshotResponse>('/usage/counter-snapshots', {
      auth_indices: normalizeAuthIndices(authIndices),
    }),

  restore: (authIndices: ReadonlyArray<string>) =>
    apiClient.delete<UsageCounterSnapshotResponse>('/usage/counter-snapshots', {
      data: { auth_indices: normalizeAuthIndices(authIndices) },
    }),
};

import { apiClient } from './client';

export interface CodexTurnStateMonitorEntry {
  timestamp_ms: number;
  provider?: string;
  auth_id?: string;
  auth_label?: string;
  endpoint?: string;
  proxy?: string;
  status?: number;
  state_length?: number;
  success: boolean;
  error?: string;
}

export interface CodexTurnStateMonitorResponse {
  items: CodexTurnStateMonitorEntry[];
}

export interface CodexTurnStateMonitorClearResponse {
  success: boolean;
  removed: number;
}

export const codexTurnStateMonitorApi = {
  list: (limit = 50): Promise<CodexTurnStateMonitorResponse> =>
    apiClient.get('/monitoring/codex-turn-state', { params: { limit } }),
  clear: (): Promise<CodexTurnStateMonitorClearResponse> =>
    apiClient.delete('/monitoring/codex-turn-state'),
};

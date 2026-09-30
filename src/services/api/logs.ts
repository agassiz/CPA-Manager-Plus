/**
 * 日志相关 API
 */

import { apiClient } from './client';
import { LOGS_TIMEOUT_MS } from '@/utils/constants';

export interface LogsQuery {
  after?: number;
}

export interface LogsResponse {
  lines: string[];
  'line-count': number;
  'latest-timestamp': number;
}

export interface ErrorLogFile {
  name: string;
  size?: number;
  modified?: number;
}

export interface ErrorLogsResponse {
  files?: ErrorLogFile[];
}

export const logsApi = {
  fetchLogs: (params: LogsQuery = {}): Promise<LogsResponse> =>
    apiClient.get('/observability/logs', { params, timeout: LOGS_TIMEOUT_MS }),

  clearLogs: () => apiClient.delete('/observability/logs'),

  fetchErrorLogs: (): Promise<ErrorLogsResponse> =>
    apiClient.get('/observability/logs/errors', { timeout: LOGS_TIMEOUT_MS }),

  downloadErrorLog: (filename: string) =>
    apiClient.getRaw(`/observability/logs/errors/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
      timeout: LOGS_TIMEOUT_MS
    }),

  downloadRequestLogById: (id: string) =>
    apiClient.getRaw(`/observability/logs/requests/${encodeURIComponent(id)}`, {
      responseType: 'blob',
      timeout: LOGS_TIMEOUT_MS
    }),
};

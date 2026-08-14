/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider =
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'gemini-cli'
  | 'kimi'
  | 'kiro'
  | 'xai';

export interface OAuthStartResponse {
  url?: string;
  state?: string;
}

export interface OAuthStatusResponse {
  status: 'ok' | 'wait' | 'error' | 'device_code' | 'auth_url';
  error?: string;
  url?: string;
  verification_url?: string;
  user_code?: string;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

const WEBUI_SUPPORTED: OAuthProvider[] = [
  'codex',
  'anthropic',
  'antigravity',
  'gemini-cli',
  'xai'
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini'
};

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: { projectId?: string; method?: string }) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    if (provider === 'kiro' && options?.method) {
      params.method = options.method;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined
    });
  },

  getAuthStatus: (state: string) =>
    apiClient.get<OAuthStatusResponse>(`/get-auth-status`, {
      params: { state }
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: callbackProvider,
      redirect_url: redirectUrl
    });
  }
};

/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider =
  | 'meta'
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'gemini-cli'
  | 'kimi'
  | 'kiro'
  | 'xai'
  | 'devin';

export interface OAuthStartResponse {
  url?: string;
  state?: string;
  user_code?: string;
  flow?: string;
  expires_in?: number;
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

export interface OAuthCancelResponse {
  status: 'ok';
  cancelled: boolean;
}

const WEBUI_SUPPORTED: OAuthProvider[] = [
  'codex',
  'anthropic',
  'antigravity',
  'gemini-cli',
  'xai',
  'devin',
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini',
};
// The v8 login endpoint names the Anthropic provider "claude".
const LOGIN_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  anthropic: 'claude',
};

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: { projectId?: string; method?: string }) => {
    const params: Record<string, string | boolean> = {
      provider: LOGIN_PROVIDER_MAP[provider] ?? provider,
    };
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    if (provider === 'kiro' && options?.method) {
      params.method = options.method;
    }
    return apiClient.get<OAuthStartResponse>('/oauth/auth-url', { params });
  },

  getAuthStatus: (state: string) =>
    apiClient.get<OAuthStatusResponse>('/oauth/status', {
      params: { state },
    }),

  cancelSession: (state: string) =>
    apiClient.delete<OAuthCancelResponse>('/oauth/session', {
      params: { state },
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth/callback', {
      provider: callbackProvider,
      redirect_url: redirectUrl,
    });
  },
};

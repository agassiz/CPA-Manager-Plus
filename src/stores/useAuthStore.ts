/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AuthSessionMode,
  AuthState,
  LoginCredentials,
  LoginResult,
  RestoreSessionResult,
  ConnectionStatus,
} from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import type { ManagementSession } from '@/services/api/client';
import { useConfigStore } from './useConfigStore';
import { useModelsStore } from './useModelsStore';
import { detectApiBaseFromLocation, normalizeApiBase, resolveRuntimeApiBase } from '@/utils/connection';

interface AuthStoreState extends AuthState {
  sessionMode: AuthSessionMode | '';
  sessionPanelBase: string;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: (options?: RestoreSessionOptions) => Promise<RestoreSessionResult>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateServerPluginSupport: (supportsPlugin: boolean) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

interface RestoreSessionOptions {
  expectedMode?: AuthSessionMode;
  expectedPanelBase?: string;
}

let restoreSessionPromise: Promise<RestoreSessionResult> | null = null;
let sessionRenewalTimer: ReturnType<typeof setTimeout> | null = null;

const SESSION_STORAGE_KEY = 'cli-proxy-management-session';
const SESSION_TOKEN_PREFIX = 'cpa_session_';
const SESSION_RENEW_LEAD_MS = 5 * 60 * 1000;

interface StoredManagementSession {
  apiBase: string;
  token: string;
  expiresAt: number;
}

const isSessionToken = (value: string): boolean => {
  if (!value.startsWith(SESSION_TOKEN_PREFIX)) return false;
  const encoded = value.slice(SESSION_TOKEN_PREFIX.length);
  const [payload, signature, ...extra] = encoded.split('.');
  return extra.length === 0 && payload?.length === 54 && signature?.length === 43;
};

const readStoredManagementSession = (): StoredManagementSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredManagementSession>;
    if (
      typeof value.apiBase !== 'string' ||
      typeof value.token !== 'string' ||
      !isSessionToken(value.token) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return { apiBase: value.apiBase, token: value.token, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
};

const storeManagementSession = (apiBase: string, session: ManagementSession): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ apiBase, token: session.token, expiresAt: session.expiresAt })
    );
  } catch {
    // Session storage is optional; the in-memory token remains usable.
  }
};

const clearStoredManagementSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures during logout.
  }
};

const clearSessionRenewalTimer = (): void => {
  if (sessionRenewalTimer !== null) {
    clearTimeout(sessionRenewalTimer);
    sessionRenewalTimer = null;
  }
};

const scheduleSessionRenewal = (
  expiresAt: number | null | undefined,
  renew: () => Promise<void>,
  onFailure: () => void
): void => {
  clearSessionRenewalTimer();
  if (!expiresAt || !Number.isFinite(expiresAt)) return;
  const delay = Math.max(1000, expiresAt - Date.now() - SESSION_RENEW_LEAD_MS);
  sessionRenewalTimer = setTimeout(() => {
    sessionRenewalTimer = null;
    void renew().catch(onFailure);
  }, delay);
};

const requestManagementSession = async (managementSecret: string): Promise<ManagementSession | null> => {
  const createSession = (apiClient as typeof apiClient & {
    createManagementSession?: (secret: string) => Promise<ManagementSession>;
  }).createManagementSession;
  if (typeof createSession !== 'function') return null;
  return createSession.call(apiClient, managementSecret);
};

const sessionMatchesExpectedRuntime = ({
  expectedMode,
  expectedPanelBase,
  resolvedBase,
  sessionMode,
}: {
  expectedMode?: AuthSessionMode;
  expectedPanelBase?: string;
  resolvedBase: string;
  sessionMode: AuthSessionMode | '';
}) => {
  const normalizedExpectedPanelBase = normalizeApiBase(expectedPanelBase || '');
  if (!expectedMode) return true;
  if (sessionMode && sessionMode !== expectedMode) return false;
  if (normalizedExpectedPanelBase) {
    return resolvedBase === normalizedExpectedPanelBase;
  }
  return true;
};

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      managementSecret: '',
      sessionTokenExpiresAt: null,
      rememberPassword: false,
      serverVersion: null,
      serverBuildDate: null,
      supportsPlugin: false,
      sessionMode: '',
      sessionPanelBase: '',
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: (options) => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          obfuscatedStorage.migratePlaintextKeys(['apiBase', 'apiUrl', 'managementKey']);

          const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const legacyBase =
            obfuscatedStorage.getItem<string>('apiBase') ||
            obfuscatedStorage.getItem<string>('apiUrl', { encrypt: true });
          const legacyKey = obfuscatedStorage.getItem<string>('managementKey');

          const {
            apiBase,
            managementKey,
            managementSecret,
            sessionTokenExpiresAt,
            rememberPassword,
            sessionMode,
          } = get();
          const resolvedBase = resolveRuntimeApiBase(
            apiBase || legacyBase || detectApiBaseFromLocation()
          );
          const storedSession = readStoredManagementSession();
          const storedToken = isSessionToken(managementKey)
            ? managementKey
            : storedSession?.apiBase === resolvedBase
              ? storedSession.token
              : '';
          const resolvedSecret =
            managementSecret ||
            (managementKey && !isSessionToken(managementKey) ? managementKey : '') ||
            legacyKey ||
            '';
          const resolvedRememberPassword = rememberPassword || Boolean(resolvedSecret);

          if (
            !sessionMatchesExpectedRuntime({
              expectedMode: options?.expectedMode,
              expectedPanelBase: options?.expectedPanelBase,
              resolvedBase,
              sessionMode,
            })
          ) {
            const fallbackBase = normalizeApiBase(options?.expectedPanelBase || detectApiBaseFromLocation());
            set({
              apiBase: fallbackBase,
              managementKey: '',
              managementSecret: '',
              sessionTokenExpiresAt: null,
              rememberPassword: false,
              supportsPlugin: false,
              sessionMode: options?.expectedMode ?? '',
              sessionPanelBase: normalizeApiBase(options?.expectedPanelBase || ''),
            });
            apiClient.setConfig({ apiBase: fallbackBase, managementKey: '' });
            localStorage.removeItem('isLoggedIn');
            return false;
          }

          set({
            apiBase: resolvedBase,
            managementKey: storedToken || resolvedSecret,
            managementSecret: resolvedSecret,
            sessionTokenExpiresAt: storedSession?.expiresAt ?? sessionTokenExpiresAt ?? null,
            rememberPassword: resolvedRememberPassword,
            sessionMode: options?.expectedMode ?? sessionMode,
            sessionPanelBase: normalizeApiBase(options?.expectedPanelBase || get().sessionPanelBase)
          });

          if (storedToken && resolvedBase && storedSession) {
            try {
              apiClient.setConfig({ apiBase: resolvedBase, managementKey: storedToken });
              await useConfigStore.getState().fetchConfig(undefined, true);
              set({
                isAuthenticated: true,
                connectionStatus: 'connected',
                connectionError: null,
                managementKey: storedToken,
                sessionTokenExpiresAt: storedSession.expiresAt,
              });
              const scheduleRenewal = (session: ManagementSession) => {
                scheduleSessionRenewal(
                  session.expiresAt,
                  async () => {
                    const current = get();
                    if (!current.isAuthenticated) return;
                    if (!current.managementSecret) {
                      current.logout();
                      return;
                    }
                    const renewed = await requestManagementSession(current.managementSecret);
                    if (!renewed) return;
                    apiClient.setConfig({ apiBase: current.apiBase, managementKey: renewed.token });
                    set({ managementKey: renewed.token, sessionTokenExpiresAt: renewed.expiresAt });
                    storeManagementSession(current.apiBase, renewed);
                    scheduleRenewal(renewed);
                  },
                  () => get().logout()
                );
              };
              scheduleRenewal(storedSession);
              return {};
            } catch (error) {
              console.warn('Stored management session restore failed:', error);
              clearStoredManagementSession();
            }
          }

          if (wasLoggedIn && resolvedBase && resolvedSecret) {
            try {
              const restoredSessionMode = options?.expectedMode ?? (sessionMode || undefined);
              const result = await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedSecret,
                rememberPassword: resolvedRememberPassword,
                sessionMode: restoredSessionMode,
                sessionPanelBase: options?.expectedPanelBase || get().sessionPanelBase,
              });
              return result.recoveryMode ? result : {};
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        const apiBase = resolveRuntimeApiBase(credentials.apiBase);
        const managementSecret = credentials.managementKey.trim();
        const rememberPassword = credentials.rememberPassword ?? get().rememberPassword ?? false;
        const sessionMode = credentials.sessionMode ?? get().sessionMode;
        const sessionPanelBase = normalizeApiBase(credentials.sessionPanelBase || get().sessionPanelBase);

        let effectiveManagementKey = managementSecret;
        let managementSession: ManagementSession | null = null;

        const scheduleRenewal = (session: ManagementSession) => {
          scheduleSessionRenewal(
            session.expiresAt,
            async () => {
              const current = get();
              if (!current.isAuthenticated || current.apiBase !== apiBase) return;
              if (!current.managementSecret) {
                current.logout();
                return;
              }
              const renewed = await requestManagementSession(current.managementSecret);
              if (!renewed) return;
              apiClient.setConfig({ apiBase, managementKey: renewed.token });
              set({ managementKey: renewed.token, sessionTokenExpiresAt: renewed.expiresAt });
              storeManagementSession(apiBase, renewed);
              scheduleRenewal(renewed);
            },
            () => get().logout()
          );
        };

        const markAuthenticated = (result: LoginResult = {}) => {
          apiClient.setConfig({ apiBase, managementKey: effectiveManagementKey });
          set({
            isAuthenticated: true,
            apiBase,
            managementKey: effectiveManagementKey,
            managementSecret,
            sessionTokenExpiresAt: managementSession?.expiresAt ?? null,
            rememberPassword,
            sessionMode,
            sessionPanelBase,
            connectionStatus: 'connected',
            connectionError: null
          });
          if (rememberPassword) {
            localStorage.setItem('isLoggedIn', 'true');
          } else {
            localStorage.removeItem('isLoggedIn');
          }
          if (managementSession) {
            storeManagementSession(apiBase, managementSession);
            scheduleRenewal(managementSession);
          } else {
            clearStoredManagementSession();
            clearSessionRenewalTimer();
          }
          return result;
        };

        try {
          set({ connectionStatus: 'connecting' });
          set({ supportsPlugin: false });
          useModelsStore.getState().clearCache();

          // 配置 API 客户端
          apiClient.setConfig({ apiBase, managementKey: managementSecret });

          try {
            managementSession = await requestManagementSession(managementSecret);
            if (managementSession) {
              effectiveManagementKey = managementSession.token;
            }
          } catch (error: unknown) {
            const status = (error as { status?: unknown })?.status;
            if (status !== 404 && status !== 405) {
              throw error;
            }
          }

          apiClient.setConfig({ apiBase, managementKey: effectiveManagementKey });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);

          // 登录成功
          return markAuthenticated();
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message || 'Connection failed'
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        clearSessionRenewalTimer();
        clearStoredManagementSession();
        useConfigStore.getState().clearCache();
        useModelsStore.getState().clearCache();
        apiClient.setConfig({ apiBase: '', managementKey: '' });
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          managementSecret: '',
          sessionTokenExpiresAt: null,
          serverVersion: null,
          serverBuildDate: null,
          supportsPlugin: false,
          sessionMode: '',
          sessionPanelBase: '',
          connectionStatus: 'disconnected',
          connectionError: null
        });
        localStorage.removeItem('isLoggedIn');
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey, apiBase } = get();

        if (!managementKey || !apiBase) {
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });
          set({ supportsPlugin: false });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected'
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error',
            supportsPlugin: false
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      updateServerPluginSupport: (supportsPlugin) => {
        set({ supportsPlugin });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error
        });
      }
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = obfuscatedStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        }
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword ? { managementSecret: state.managementSecret || state.managementKey } : {}),
        rememberPassword: state.rememberPassword,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
        sessionMode: state.sessionMode,
        sessionPanelBase: state.sessionPanelBase
      })
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
  });

  window.addEventListener(
    'server-version-update',
    ((e: CustomEvent) => {
      const detail = e.detail || {};
      useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
    }) as EventListener
  );

  window.addEventListener(
    'server-plugin-support-update',
    ((e: CustomEvent) => {
      useAuthStore.getState().updateServerPluginSupport(e.detail?.supportsPlugin === true);
    }) as EventListener
  );
}

/**
 * 认证相关类型定义
 * 基于原项目 src/modules/login.js 和 src/core/connection.js
 */

export type AuthSessionMode = 'local';

// 登录凭据
export interface LoginCredentials {
  apiBase: string;
  managementKey: string;
  rememberPassword?: boolean;
  sessionMode?: AuthSessionMode;
  sessionPanelBase?: string;
}

export type LoginRecoveryMode = never;

export interface LoginResult {
  recoveryMode?: LoginRecoveryMode;
}

export type RestoreSessionResult = LoginResult | false;

// 认证状态
export interface AuthState {
  isAuthenticated: boolean;
  apiBase: string;
  managementKey: string;
  managementSecret?: string;
  sessionTokenExpiresAt?: number | null;
  rememberPassword: boolean;
  serverVersion: string | null;
  serverBuildDate: string | null;
  supportsPlugin: boolean;
}

// 连接状态
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  lastCheck: Date | null;
  error: string | null;
}

/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

import type { RecentRequestBucket } from '@/utils/recentRequests';
import type { CodexUsagePayload } from '@/types/quota';

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'xai'
  | 'kiro'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface AuthFileItem {
	/** Stable runtime credential identifier used by access rules. */
	id?: string;
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  error?: string;
  errorStatus?: string | number;
  cooldown_active?: boolean;
  cooldown_until?: string | number;
  lastRefresh?: string | number;
  modified?: number;
  success?: unknown;
  failed?: unknown;
  project_id?: string;
  projectId?: string;
  gemini_virtual_project?: string;
  geminiVirtualProject?: string;
  recent_requests?: RecentRequestBucket[];
  recentRequests?: RecentRequestBucket[];
  super_category?: boolean;
  superCategory?: boolean;
  super_category_allowed?: boolean;
  superCategoryAllowed?: boolean;
  subscription_title?: string;
  subscriptionTitle?: string;
  subscription_tier?: string;
  subscription_type?: string;
  auth_method?: string;
  authMethod?: string;
  kiro_account_type_label?: string;
  kiroAccountTypeLabel?: string;
  kiro_profile_badge_label?: string;
  kiroProfileBadgeLabel?: string;
  codex_quota?: CodexUsagePayload;
  codex_quota_updated_at_ms?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}

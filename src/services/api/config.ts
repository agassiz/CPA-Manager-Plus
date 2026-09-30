/**
 * 配置相关 API（v8 配置树，经 v8Config 适配为 legacy 平铺结构）
 */

import type { Config } from '@/types';
import { configV8Api, toV8Path } from './v8Config';
import { normalizeConfigResponse } from './transformers';

export const configApi = {
  /**
   * 获取配置（会进行字段规范化）
   */
  async getConfig(): Promise<Config> {
    const raw = await configV8Api.readFlat();
    return normalizeConfigResponse(raw);
  },

  /**
   * 获取原始配置（v8 树转换为 legacy 平铺结构，不做字段规范化）
   */
  getRawConfig: () => configV8Api.readFlat(),

  /**
   * 更新 Debug 模式
   */
  updateDebug: (enabled: boolean) => configV8Api.put('debug', enabled),

  /**
   * 更新代理 URL
   */
  updateProxyUrl: (proxyUrl: string) => configV8Api.put('proxy-url', proxyUrl),

  /**
   * 清除代理 URL
   */
  clearProxyUrl: () => configV8Api.remove('proxy-url'),

  /**
   * 更新重试次数
   */
  updateRequestRetry: (retryCount: number) => configV8Api.put('request-retry', retryCount),

  /**
   * 配额回退：切换项目
   */
  updateSwitchProject: (enabled: boolean) => configV8Api.put('quota-exceeded.switch-project', enabled),

  /**
   * 配额回退：切换预览模型
   */
  updateSwitchPreviewModel: (enabled: boolean) =>
    configV8Api.put('quota-exceeded.switch-preview-model', enabled),

  /**
   * 请求日志开关
   */
  updateRequestLog: (enabled: boolean) => configV8Api.put('request-log', enabled),

  /**
   * 写日志到文件开关
   */
  updateLoggingToFile: (enabled: boolean) => configV8Api.put('logging-to-file', enabled),

  /**
   * 获取日志总大小上限（MB）
   */
  async getLogsMaxTotalSizeMb(): Promise<number> {
    const value = await configV8Api.readValue<unknown>(toV8Path('logs-max-total-size-mb'), 0);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  },

  /**
   * 更新日志总大小上限（MB）
   */
  updateLogsMaxTotalSizeMb: (value: number) => configV8Api.put('logs-max-total-size-mb', value),

  /**
   * WebSocket 鉴权开关
   */
  updateWsAuth: (enabled: boolean) => configV8Api.put('ws-auth', enabled),

  /**
   * 获取强制模型前缀开关
   */
  async getForceModelPrefix(): Promise<boolean> {
    return Boolean(await configV8Api.readValue<unknown>(toV8Path('force-model-prefix'), false));
  },

  /**
   * 更新强制模型前缀开关
   */
  updateForceModelPrefix: (enabled: boolean) => configV8Api.put('force-model-prefix', enabled),

  /**
   * 获取路由策略
   */
  async getRoutingStrategy(): Promise<string> {
    const strategy = await configV8Api.readValue<unknown>(['routing', 'strategy'], 'round-robin');
    return typeof strategy === 'string' ? strategy : 'round-robin';
  },

  /**
   * 更新路由策略
   */
  updateRoutingStrategy: (strategy: string) => configV8Api.putAt(['routing', 'strategy'], strategy),
};

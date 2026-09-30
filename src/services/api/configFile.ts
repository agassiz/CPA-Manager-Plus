/**
 * 配置文件相关 API（/config.yaml）
 *
 * v8 端返回 v8 分组布局的 YAML；界面模型使用 legacy 平铺布局，因此读取时转换为 legacy，
 * 保存时再转换回 v8。
 */

import { apiClient } from './client';
import { legacyYamlToV8, v8YamlToLegacy } from './v8ConfigYaml';

export const configFileApi = {
  async fetchConfigYaml(): Promise<string> {
    const response = await apiClient.getRaw('/config.yaml', {
      responseType: 'text',
      headers: { Accept: 'application/yaml, text/yaml, text/plain' },
    });
    const data: unknown = response.data;
    const text = typeof data === 'string' ? data : data === undefined || data === null ? '' : String(data);
    return text ? v8YamlToLegacy(text) : text;
  },

  async saveConfigYaml(content: string): Promise<void> {
    await apiClient.put('/config.yaml', legacyYamlToV8(content), {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  },
};

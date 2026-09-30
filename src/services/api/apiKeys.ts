/**
 * API 密钥管理（v8：config/access/api-keys，按整表读写）
 */

import { configV8Api } from './v8Config';

const KEYS_PATH = ['access', 'api-keys'];

const readKeys = async (): Promise<string[]> => {
  const keys = await configV8Api.readValue<unknown>(KEYS_PATH, []);
  return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
};

export const apiKeysApi = {
  list: readKeys,

  replace: (keys: string[]) => configV8Api.putAt(KEYS_PATH, keys),

  async update(index: number, value: string) {
    const keys = await readKeys();
    if (index < 0 || index >= keys.length) throw new Error('API key index out of range');
    keys[index] = value;
    return configV8Api.putAt(KEYS_PATH, keys);
  },

  async delete(index: number) {
    const keys = await readKeys();
    if (index < 0 || index >= keys.length) throw new Error('API key index out of range');
    return configV8Api.putAt(
      KEYS_PATH,
      keys.filter((_, at) => at !== index)
    );
  },
};

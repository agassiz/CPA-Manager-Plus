import { apiClient } from './client';
import { configV8Api } from './v8Config';
import { isRecord } from '@/utils/helpers';
import type {
  PluginConfigField,
  PluginConfigObject,
  PluginDeleteResult,
  PluginListEntry,
  PluginListResponse,
  PluginMetadata,
  PluginMenu,
  PluginStoreEntry,
  PluginStoreInstallProgressEvent,
  PluginStoreInstallResult,
  PluginStoreResponse,
} from '@/types';

const asString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value);
};

const asBoolean = (value: unknown): boolean => value === true;

const normalizeConfigField = (value: unknown): PluginConfigField | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  if (!name) return null;
  const enumValues = Array.isArray(value.enum_values)
    ? value.enum_values.map((item) => asString(item)).filter(Boolean)
    : [];
  return {
    name,
    type: asString(value.type).trim() || 'string',
    enumValues,
    description: asString(value.description).trim(),
  };
};

const normalizeConfigFields = (value: unknown): PluginConfigField[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeConfigField(item)).filter(Boolean) as PluginConfigField[]
    : [];

const normalizeMetadata = (value: unknown): PluginMetadata | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  const version = asString(value.version).trim();
  const author = asString(value.author).trim();
  const githubRepository = asString(value.github_repository).trim();
  const logo = asString(value.logo).trim();
  const configFields = normalizeConfigFields(value.config_fields);

  if (!name && !version && !author && !githubRepository && !logo && configFields.length === 0) {
    return null;
  }

  return {
    name,
    version,
    author,
    githubRepository,
    logo,
    configFields,
  };
};

const normalizeMenu = (value: unknown): PluginMenu | null => {
  if (!isRecord(value)) return null;
  const path = asString(value.path).trim();
  const menu = asString(value.menu).trim();
  if (!path && !menu) return null;
  return {
    path,
    menu,
    description: asString(value.description).trim(),
  };
};

const normalizeMenus = (value: unknown): PluginMenu[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeMenu(item)).filter(Boolean) as PluginMenu[]
    : [];

const normalizePluginEntry = (value: unknown): PluginListEntry | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  if (!id) return null;

  const metadata = normalizeMetadata(value.metadata);
  const configFields = normalizeConfigFields(value.config_fields);

  return {
    id,
    path: asString(value.path).trim(),
    configured: asBoolean(value.configured),
    registered: asBoolean(value.registered),
    enabled: value.enabled !== false,
    effectiveEnabled: asBoolean(value.effective_enabled),
    supportsOAuth: asBoolean(value.supports_oauth),
    logo: asString(value.logo || metadata?.logo).trim(),
    configFields: configFields.length > 0 ? configFields : metadata?.configFields ?? [],
    menus: normalizeMenus(value.menus),
    metadata,
  };
};

const normalizePluginList = (value: unknown): PluginListResponse => {
  const source = isRecord(value) ? value : {};
  const plugins = Array.isArray(source.plugins)
    ? source.plugins.map((item) => normalizePluginEntry(item)).filter(Boolean) as PluginListEntry[]
    : [];

  return {
    pluginsEnabled: asBoolean(source.plugins_enabled),
    pluginsDir: asString(source.plugins_dir).trim() || 'plugins',
    plugins,
  };
};

const normalizePluginConfig = (value: unknown): PluginConfigObject =>
  isRecord(value) ? { ...value } : {};

const normalizeDeleteResult = (value: unknown): PluginDeleteResult => {
  const source = isRecord(value) ? value : {};
  return {
    status: asString(source.status).trim(),
    id: asString(source.id).trim(),
    path: asString(source.path).trim(),
    fileDeleted: asBoolean(source.file_deleted),
    configuredRemoved: asBoolean(source.configured_removed),
    restartRequired: asBoolean(source.restart_required),
  };
};

const normalizeStoreEntry = (value: unknown): PluginStoreEntry | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  if (!id) return null;

  const tags = Array.isArray(value.tags)
    ? value.tags.map((item) => asString(item).trim()).filter(Boolean)
    : [];

  return {
    id,
    name: asString(value.name).trim(),
    description: asString(value.description).trim(),
    author: asString(value.author).trim(),
    version: asString(value.version).trim(),
    repository: asString(value.repository).trim(),
    logo: asString(value.logo).trim(),
    homepage: asString(value.homepage).trim(),
    license: asString(value.license).trim(),
    tags,
    installed: asBoolean(value.installed),
    installedVersion: asString(value.installed_version).trim(),
    path: asString(value.path).trim(),
    configured: asBoolean(value.configured),
    registered: asBoolean(value.registered),
    enabled: asBoolean(value.enabled),
    effectiveEnabled: asBoolean(value.effective_enabled),
    updateAvailable: asBoolean(value.update_available),
  };
};

const normalizeStoreList = (value: unknown): PluginStoreResponse => {
  const source = isRecord(value) ? value : {};
  const plugins = Array.isArray(source.plugins)
    ? source.plugins.map((item) => normalizeStoreEntry(item)).filter(Boolean) as PluginStoreEntry[]
    : [];

  return {
    pluginsEnabled: asBoolean(source.plugins_enabled),
    pluginsDir: asString(source.plugins_dir).trim() || 'plugins',
    plugins,
  };
};

const normalizeInstallResult = (value: unknown): PluginStoreInstallResult => {
  const source = isRecord(value) ? value : {};
  return {
    status: asString(source.status).trim(),
    id: asString(source.id).trim(),
    version: asString(source.version).trim(),
    path: asString(source.path).trim(),
    pluginsEnabled: asBoolean(source.plugins_enabled),
    restartRequired: asBoolean(source.restart_required),
  };
};

const normalizeInstallProgressEvent = (value: unknown): PluginStoreInstallProgressEvent => {
  const source = isRecord(value) ? value : {};
  const rawType = asString(source.type).trim();
  const type =
    rawType === 'installed' || rawType === 'error' || rawType === 'progress'
      ? rawType
      : 'progress';
  const result = source.result ? normalizeInstallResult(source.result) : null;
  const downloaded = Number(source.downloaded);
  const total = Number(source.total);
  const percent = Number(source.percent);

  return {
    type,
    stage: asString(source.stage).trim(),
    assetName: asString(source.asset_name).trim(),
    downloaded: Number.isFinite(downloaded) ? downloaded : 0,
    total: Number.isFinite(total) ? total : 0,
    percent: Number.isFinite(percent) ? percent : 0,
    message: asString(source.message).trim(),
    error: asString(source.error).trim(),
    restartRequired: asBoolean(source.restart_required),
    result,
  };
};

const parseInstallProgressLine = (line: string): PluginStoreInstallProgressEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return normalizeInstallProgressEvent(JSON.parse(trimmed));
  } catch {
    return null;
  }
};

const errorFromInstallEvent = (event: PluginStoreInstallProgressEvent): Error => {
  const message = event.message || event.error || 'Plugin install failed';
  const error = new Error(message) as Error & {
    status?: number;
    details?: unknown;
    data?: unknown;
  };
  error.name = 'ApiError';
  error.details = event;
  error.data = event;
  return error;
};

const pluginConfigPath = (id: string): string[] => ['plugins', 'configs', id];

export const pluginsApi = {
  async list(): Promise<PluginListResponse> {
    const data = await apiClient.get('/plugins');
    return normalizePluginList(data);
  },

  updateEnabled: (id: string, enabled: boolean) =>
    configV8Api.patchAt(pluginConfigPath(id), { enabled }),

  async deletePlugin(id: string): Promise<PluginDeleteResult> {
    const data = await apiClient.delete(`/plugins/${encodeURIComponent(id)}`);
    return normalizeDeleteResult(data);
  },

  async getConfig(id: string): Promise<PluginConfigObject> {
    const data = await configV8Api.readValue<unknown>(pluginConfigPath(id), {});
    return normalizePluginConfig(data);
  },

  putConfig: (id: string, config: PluginConfigObject) =>
    configV8Api.putAt(pluginConfigPath(id), config),

  // v8 PATCH keeps null values, so apply the shallow merge (null removes a key) here.
  async patchConfig(id: string, patch: PluginConfigObject) {
    const next: PluginConfigObject = { ...(await pluginsApi.getConfig(id)) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete next[key];
      else next[key] = value;
    }
    return configV8Api.putAt(pluginConfigPath(id), next);
  },
};

export const pluginStoreApi = {
  async list(): Promise<PluginStoreResponse> {
    const data = await apiClient.get('/plugins/store');
    return normalizeStoreList(data);
  },

  async install(id: string): Promise<PluginStoreInstallResult> {
    const data = await apiClient.post(`/plugins/store/${encodeURIComponent(id)}/install`);
    return normalizeInstallResult(data);
  },

  async installStream(
    id: string,
    options: {
      signal?: AbortSignal;
      onProgress?: (event: PluginStoreInstallProgressEvent) => void;
    } = {}
  ): Promise<PluginStoreInstallResult> {
    const response = await apiClient.fetchRaw(
      `/plugins/store/${encodeURIComponent(id)}/install/stream`,
      {
        method: 'POST',
        signal: options.signal,
      }
    );
    if (!response.ok) {
      let message = response.statusText || 'Plugin install failed';
      try {
        const payload = await response.json();
        if (isRecord(payload) && typeof payload.message === 'string') {
          message = payload.message;
        }
      } catch {
        // Keep the HTTP status text.
      }
      const error = new Error(message) as Error & { status?: number };
      error.name = 'ApiError';
      error.status = response.status;
      throw error;
    }
    if (!response.body) {
      const payload = await response.json();
      return normalizeInstallResult(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: PluginStoreInstallResult | null = null;

    const handleLine = (line: string) => {
      const event = parseInstallProgressLine(line);
      if (!event) return;
      options.onProgress?.(event);
      if (event.type === 'error') {
        throw errorFromInstallEvent(event);
      }
      if (event.type === 'installed' && event.result) {
        result = event.result;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        handleLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      handleLine(buffer);
    }
    if (!result) {
      throw new Error('Plugin install did not return a result');
    }
    return result;
  },
};

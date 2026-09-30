/**
 * v8 configuration adapter.
 *
 * The v8 management API stores configuration as a regrouped tree (for example
 * `routing.retry.request-retry`, `api-keys.<family>[].keys`). The UI models are
 * built around the legacy flat layout, so this module converts between the two
 * at the API boundary. The rules mirror `internal/config/config_v8.go`.
 */

import { apiClient } from './client';

type PlainObject = Record<string, unknown>;

/** [legacy path, v8 path] pairs, mirroring the backend layout table. */
export const V8_PATH_RULES: ReadonlyArray<readonly [string, string]> = [
  ['host', 'server.host'],
  ['port', 'server.port'],
  ['trusted-proxies', 'server.trusted-proxies'],
  ['tls', 'server.tls'],
  ['commercial-mode', 'server.commercial-mode'],
  ['discovery', 'server.discovery'],
  ['remote-management', 'management'],
  ['api-keys', 'access.api-keys'],
  ['credential-concurrency', 'credentials.concurrency'],
  ['credential-in-flight', 'credentials.in-flight'],
  ['force-model-prefix', 'routing.force-model-prefix'],
  ['request-retry', 'routing.retry.request-retry'],
  ['max-retry-credentials', 'routing.retry.max-retry-credentials'],
  ['max-retry-interval', 'routing.retry.max-retry-interval'],
  ['disable-cooling', 'routing.cooldown.disable-cooling'],
  ['save-cooldown-status', 'routing.cooldown.save-cooldown-status'],
  ['transient-error-cooldown-seconds', 'routing.cooldown.transient-error-cooldown-seconds'],
  ['proxy-url', 'requests.proxy-url'],
  ['passthrough-headers', 'requests.passthrough-headers'],
  ['nonstream-keepalive-interval', 'requests.nonstream-keepalive-interval'],
  ['streaming', 'requests.streaming'],
  ['payload', 'requests.payload'],
  ['auth-dir', 'oauth.auth-dir'],
  ['auth-auto-refresh-workers', 'oauth.auth-auto-refresh-workers'],
  ['oauth-model-alias', 'oauth.model-alias'],
  ['oauth-excluded-models', 'oauth.excluded-models'],
  ['oauth-request-scoped-errors', 'oauth.request-scoped-errors'],
  ['oauth-settings', 'oauth.settings'],
  ['ws-auth', 'oauth.providers.aistudio.ws-auth'],
  ['codex', 'oauth.providers.codex'],
  ['codex-header-defaults', 'oauth.providers.codex.header-defaults'],
  ['claude', 'oauth.providers.claude'],
  ['claude-code', 'oauth.providers.claude.claude-code'],
  ['disable-claude-cloak-mode', 'oauth.providers.claude.disable-claude-cloak-mode'],
  ['claude-header-defaults', 'oauth.providers.claude.header-defaults'],
  ['antigravity', 'oauth.providers.antigravity'],
  ['antigravity-signature-cache-enabled', 'oauth.providers.antigravity.signature-cache-enabled'],
  ['antigravity-signature-bypass-strict', 'oauth.providers.antigravity.signature-bypass-strict'],
  ['quota-exceeded.antigravity-credits', 'oauth.providers.antigravity.antigravity-credits'],
  ['xai', 'oauth.providers.xai'],
  ['devin', 'oauth.providers.devin'],
  ['disable-image-generation', 'multimedia.disable-image-generation'],
  ['gpt-image-2-base-model', 'multimedia.gpt-image-2-base-model'],
  ['video-result-auth-cache-ttl', 'multimedia.video-result-auth-cache-ttl'],
  ['debug', 'observability.logs.debug'],
  ['logging-to-file', 'observability.logs.logging-to-file'],
  ['logs-max-total-size-mb', 'observability.logs.logs-max-total-size-mb'],
  ['request-log', 'observability.logs.request-log'],
  ['error-logs-max-files', 'observability.logs.error-logs-max-files'],
  ['usage-statistics-enabled', 'observability.usage.usage-statistics-enabled'],
  [
    'redis-usage-queue-retention-seconds',
    'observability.usage.redis-usage-queue-retention-seconds',
  ],
  ['pprof', 'observability.pprof'],
];

/** [legacy list key, v8 family] pairs for upstream provider key groups. */
export const V8_KEY_FAMILIES: ReadonlyArray<readonly [string, string]> = [
  ['gemini-api-key', 'gemini'],
  ['interactions-api-key', 'interactions'],
  ['vertex-api-key', 'vertex'],
  ['codex-api-key', 'codex'],
  ['claude-api-key', 'claude'],
  ['xai-api-key', 'xai'],
  ['meta-api-key', 'meta'],
  ['openai-compatibility', 'openai-compatibility'],
];

const SHARED_KEY_FIELDS = new Set([
  'priority',
  'prefix',
  'proxy-url',
  'headers',
  'models',
  'excluded-models',
  'disable-cooling',
  'request-retry',
  'request-scoped-errors',
]);

const isPlainObject = (value: unknown): value is PlainObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const splitPath = (path: string): string[] => path.split('.');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getPath = (root: PlainObject, path: string[]): unknown => {
  let node: unknown = root;
  for (const key of path) {
    if (!isPlainObject(node) || !Object.prototype.hasOwnProperty.call(node, key)) return undefined;
    node = node[key];
  }
  return node;
};

const setPath = (root: PlainObject, path: string[], value: unknown): void => {
  let node = root;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (isPlainObject(next)) {
      node = next;
    } else {
      const created: PlainObject = {};
      node[key] = created;
      node = created;
    }
  }
  node[path[path.length - 1]] = value;
};

/** Removes a key and prunes ancestors that became empty. */
const deletePath = (root: PlainObject, path: string[]): boolean => {
  const [head, ...rest] = path;
  if (!Object.prototype.hasOwnProperty.call(root, head)) return false;
  if (rest.length > 0) {
    const child = root[head];
    if (!isPlainObject(child) || !deletePath(child, rest)) return false;
    if (Object.keys(child).length > 0) return true;
  }
  delete root[head];
  return true;
};

const rulesByDepth = (deepestFirst: boolean, side: 0 | 1) =>
  [...V8_PATH_RULES].sort(
    (a, b) => (splitPath(a[side]).length - splitPath(b[side]).length) * (deepestFirst ? -1 : 1)
  );

/** Expands v8 provider groups into the legacy per-key entries. */
export function expandProviderGroups(groups: unknown, family: string): PlainObject[] {
  if (!Array.isArray(groups)) return [];
  const out: PlainObject[] = [];
  for (const group of groups) {
    if (!isPlainObject(group)) continue;
    const keys = Array.isArray(group.keys) ? group.keys : [];
    if (family === 'openai-compatibility') {
      const { keys: _keys, ...rest } = group;
      void _keys;
      out.push({ ...rest, 'api-key-entries': keys });
      continue;
    }
    for (const key of keys) {
      if (!isPlainObject(key)) continue;
      const item: PlainObject = {};
      for (const [field, value] of Object.entries(group)) {
        if (field === 'base-url' || SHARED_KEY_FIELDS.has(field)) item[field] = value;
      }
      for (const [field, value] of Object.entries(key)) {
        if (value !== null) item[field] = value;
      }
      out.push(item);
    }
  }
  return out;
}

/** Groups legacy entries, one group per entry (equal endpoints do not imply equal policy). */
export function groupProviderEntries(entries: unknown, family: string): PlainObject[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter(isPlainObject).map((entry, index) => {
    if (family === 'openai-compatibility') {
      const { 'api-key-entries': keyEntries, ...rest } = entry;
      return { ...rest, keys: Array.isArray(keyEntries) ? keyEntries : [] };
    }
    const group: PlainObject = { name: `${family}-${index + 1}` };
    const key: PlainObject = {};
    for (const [field, value] of Object.entries(entry)) {
      if (field === 'base-url' || SHARED_KEY_FIELDS.has(field)) group[field] = value;
      else key[field] = value;
    }
    group.keys = [key];
    return group;
  });
}

/** Converts a v8 configuration tree into the legacy flat layout used by the UI models. */
export function flattenV8Config(tree: unknown): PlainObject {
  if (!isPlainObject(tree)) return {};
  const out = clone(tree);
  delete out['config-version'];

  const families: Array<[string, PlainObject[]]> = [];
  const groups = out['api-keys'];
  if (isPlainObject(groups)) {
    for (const [legacy, current] of V8_KEY_FAMILIES) {
      if (Object.prototype.hasOwnProperty.call(groups, current)) {
        families.push([legacy, expandProviderGroups(groups[current], current)]);
      }
    }
    delete out['api-keys'];
  }

  for (const [legacy, current] of rulesByDepth(true, 1)) {
    const path = splitPath(current);
    const value = getPath(out, path);
    if (value === undefined) continue;
    deletePath(out, path);
    setPath(out, splitPath(legacy), value);
  }
  for (const [legacy, entries] of families) out[legacy] = entries;
  return out;
}

/** Resolves the v8 path segments for a legacy dotted key such as `request-retry`. */
export function toV8Path(legacyPath: string): string[] {
  let best: readonly [string, string] | null = null;
  for (const rule of V8_PATH_RULES) {
    const [legacy] = rule;
    if (legacyPath === legacy || legacyPath.startsWith(`${legacy}.`)) {
      if (!best || legacy.length > best[0].length) best = rule;
    }
  }
  if (!best) return splitPath(legacyPath);
  return splitPath(`${best[1]}${legacyPath.slice(best[0].length)}`);
}

export const isV8FamilyKey = (legacyKey: string): boolean =>
  V8_KEY_FAMILIES.some(([legacy]) => legacy === legacyKey);

const familyOf = (legacyKey: string): string => {
  const match = V8_KEY_FAMILIES.find(([legacy]) => legacy === legacyKey);
  if (!match) throw new Error(`Unknown provider family: ${legacyKey}`);
  return match[1];
};

export const configFieldUrl = (path: string[]): string => {
  if (
    !path.length ||
    path.some(
      (key) =>
        !key ||
        key === '.' ||
        key === '..' ||
        key.includes('/') ||
        key.includes('\\') ||
        Array.from(key).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
  ) {
    throw new Error('Configuration field path cannot be safely represented');
  }
  return `/config/${path.map((key) => encodeURIComponent(key)).join('/')}`;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// A pre-serialized body keeps scalars such as "5" or "true" as JSON strings.
const jsonBody = (value: unknown): string => JSON.stringify(value === undefined ? null : value);

export const isConfigValueMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  (error as { status?: number }).status === 404;

export const configV8Api = {
  /** Reads the persisted v8 tree. */
  readTree: () => apiClient.get<PlainObject>('/config'),

  /** Reads the configuration and converts it to the legacy flat layout. */
  async readFlat(): Promise<PlainObject> {
    return flattenV8Config(await this.readTree());
  },

  /** Reads one value by v8 path; a missing field resolves to the fallback. */
  async readValue<T>(v8Path: string[], fallback: T): Promise<T> {
    try {
      return await apiClient.get<T>(configFieldUrl(v8Path));
    } catch (error) {
      if (isConfigValueMissing(error)) return fallback;
      throw error;
    }
  },

  /** Replaces a field addressed by its legacy dotted key. */
  put: (legacyKey: string, value: unknown) =>
    apiClient.put(configFieldUrl(toV8Path(legacyKey)), jsonBody(value), { headers: JSON_HEADERS }),

  /** Replaces a field addressed by its v8 path. */
  putAt: (v8Path: string[], value: unknown) =>
    apiClient.put(configFieldUrl(v8Path), jsonBody(value), { headers: JSON_HEADERS }),

  /** Merges an object into a field addressed by its v8 path. */
  patchAt: (v8Path: string[], value: unknown) =>
    apiClient.patch(configFieldUrl(v8Path), jsonBody(value), { headers: JSON_HEADERS }),

  /** Removes a field addressed by its legacy dotted key. */
  async remove(legacyKey: string): Promise<void> {
    try {
      await apiClient.delete(configFieldUrl(toV8Path(legacyKey)));
    } catch (error) {
      if (!isConfigValueMissing(error)) throw error;
    }
  },

  /** Replaces the whole provider list of a legacy family key (for example `codex-api-key`). */
  putProviderList: (legacyKey: string, entries: unknown[]) => {
    const family = familyOf(legacyKey);
    return apiClient.put(
      configFieldUrl(['api-keys', family]),
      jsonBody(groupProviderEntries(entries, family)),
      { headers: JSON_HEADERS }
    );
  },
};

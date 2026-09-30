import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  flattenV8Config,
  groupProviderEntries,
  expandProviderGroups,
  toV8Path,
  configFieldUrl,
} from './v8Config';
import { legacyYamlToV8, v8YamlToLegacy } from './v8ConfigYaml';

const v8Tree = {
  'config-version': 8,
  server: { port: 8317 },
  access: { 'api-keys': ['client-1'] },
  routing: { strategy: 'fill-first', retry: { 'request-retry': 3 }, 'force-model-prefix': true },
  requests: { 'proxy-url': 'http://proxy' },
  observability: { logs: { debug: true, 'request-log': false } },
  oauth: {
    'excluded-models': { claude: ['a'] },
    providers: { aistudio: { 'ws-auth': true }, antigravity: { 'antigravity-credits': true } },
  },
  'quota-exceeded': { 'switch-project': true },
  'api-keys': {
    codex: [{ name: 'codex-1', 'base-url': 'https://x', priority: 2, keys: [{ 'api-key': 'k1' }, { 'api-key': 'k2' }] }],
    'openai-compatibility': [{ name: 'oa', 'base-url': 'https://y', keys: [{ 'api-key': 'z' }] }],
  },
};

describe('flattenV8Config', () => {
  it('maps the v8 tree to the legacy flat layout', () => {
    const flat = flattenV8Config(v8Tree);
    expect(flat['request-retry']).toBe(3);
    expect(flat['force-model-prefix']).toBe(true);
    expect(flat['proxy-url']).toBe('http://proxy');
    expect(flat.debug).toBe(true);
    expect(flat['request-log']).toBe(false);
    expect(flat['ws-auth']).toBe(true);
    expect(flat['api-keys']).toEqual(['client-1']);
    expect(flat['oauth-excluded-models']).toEqual({ claude: ['a'] });
    expect((flat['quota-exceeded'] as Record<string, unknown>)['antigravity-credits']).toBe(true);
    expect((flat['quota-exceeded'] as Record<string, unknown>)['switch-project']).toBe(true);
    expect((flat.routing as Record<string, unknown>).strategy).toBe('fill-first');
    expect(flat['codex-api-key']).toEqual([
      { 'base-url': 'https://x', priority: 2, 'api-key': 'k1' },
      { 'base-url': 'https://x', priority: 2, 'api-key': 'k2' },
    ]);
    expect(flat['openai-compatibility']).toEqual([
      { name: 'oa', 'base-url': 'https://y', 'api-key-entries': [{ 'api-key': 'z' }] },
    ]);
    expect(flat.observability).toBeUndefined();
  });
});

describe('provider grouping', () => {
  it('round-trips legacy entries one group per entry', () => {
    const entries = [{ 'api-key': 'k', 'base-url': 'https://x', models: [{ name: 'm' }] }];
    const groups = groupProviderEntries(entries, 'claude');
    expect(groups).toEqual([
      { name: 'claude-1', 'base-url': 'https://x', models: [{ name: 'm' }], keys: [{ 'api-key': 'k' }] },
    ]);
    expect(expandProviderGroups(groups, 'claude')).toEqual(entries);
  });
});

describe('toV8Path', () => {
  it('resolves legacy keys with longest-prefix rules', () => {
    expect(toV8Path('request-retry')).toEqual(['routing', 'retry', 'request-retry']);
    expect(toV8Path('quota-exceeded.antigravity-credits')).toEqual([
      'oauth', 'providers', 'antigravity', 'antigravity-credits',
    ]);
    expect(toV8Path('quota-exceeded.switch-project')).toEqual(['quota-exceeded', 'switch-project']);
    expect(toV8Path('codex-header-defaults')).toEqual(['oauth', 'providers', 'codex', 'header-defaults']);
    expect(toV8Path('unknown-key')).toEqual(['unknown-key']);
  });

  it('rejects unsafe segments', () => {
    expect(() => configFieldUrl(['a', '..'])).toThrow();
    expect(configFieldUrl(['routing', 'retry', 'request-retry'])).toBe('/config/routing/retry/request-retry');
  });
});

describe('YAML layout conversion', () => {
  const legacy = `# top
debug: true
request-retry: 3
proxy-url: http://proxy
api-keys:
  - client-1
ws-auth: true
quota-exceeded:
  switch-project: true
  antigravity-credits: true
oauth-excluded-models:
  claude: [a]
codex-header-defaults:
  user-agent: ua
codex-api-key:
  - api-key: k1
    base-url: https://x
  - api-key: k2
    base-url: https://x
openai-compatibility:
  - name: oa
    base-url: https://y
    api-key-entries:
      - api-key: z
`;

  it('converts legacy YAML to v8 and back without losing values', () => {
    const v8 = parse(legacyYamlToV8(legacy));
    expect(v8['config-version']).toBe(8);
    expect(v8.routing.retry['request-retry']).toBe(3);
    expect(v8.observability.logs.debug).toBe(true);
    expect(v8.access['api-keys']).toEqual(['client-1']);
    expect(v8.oauth.providers.aistudio['ws-auth']).toBe(true);
    expect(v8.oauth.providers.antigravity['antigravity-credits']).toBe(true);
    expect(v8.oauth.providers.codex['header-defaults']).toEqual({ 'user-agent': 'ua' });
    expect(v8['quota-exceeded']).toEqual({ 'switch-project': true });
    expect(v8['api-keys'].codex).toHaveLength(2);
    expect(v8['api-keys']['openai-compatibility'][0].keys).toEqual([{ 'api-key': 'z' }]);
    expect(v8['request-retry']).toBeUndefined();

    const back = parse(v8YamlToLegacy(legacyYamlToV8(legacy)));
    expect(back).toEqual(parse(legacy));
  });

  it('keeps comments on moved keys', () => {
    const out = legacyYamlToV8('# keep me\ndebug: true # inline\n');
    expect(out).toContain('# inline');
  });
});

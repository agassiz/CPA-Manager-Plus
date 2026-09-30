/**
 * 自定义请求头处理工具
 */

export interface HeaderEntry {
  key: string;
  value: string;
}

export function buildHeaderObject(input?: HeaderEntry[] | Record<string, string | undefined | null>): Record<string, string> {
  if (!input) return {};

  if (Array.isArray(input)) {
    return input.reduce<Record<string, string>>((acc, item) => {
      const key = item?.key?.trim();
      const value = item?.value?.trim();
      if (key && value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  return Object.entries(input).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey?.trim();
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (key && value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
}

export function hasHeader(headers: Record<string, unknown> | null | undefined, name: string): boolean {
  if (!headers) return false;
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

// Mirrors the Codex Desktop identity the backend Codex/OpenAI-compat executors send
// (codexDesktopUserAgent / codexDesktopOriginator), so relays that gate on the
// client identity accept /models discovery the same way they accept live traffic.
export const CODEX_CLIENT_IDENTITY_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent':
    'Codex Desktop/0.155.0-alpha.9.2 (Mac OS 26.6.2; arm64) unknown (Codex Desktop; 26.915.31945)',
  Originator: 'Codex Desktop',
};

export function withCodexClientIdentity(headers: Record<string, string> = {}): Record<string, string> {
  return hasHeader(headers, 'user-agent') ? headers : { ...CODEX_CLIENT_IDENTITY_HEADERS, ...headers };
}

// Mirrors the backend Claude executor's default fingerprint
// (defaultClaudeFingerprintUserAgent) for the same client-identity reason.
export const CLAUDE_CLIENT_IDENTITY_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'claude-cli/2.1.280 (external, cli)',
};

export function withClaudeClientIdentity(headers: Record<string, string> = {}): Record<string, string> {
  return hasHeader(headers, 'user-agent') ? headers : { ...CLAUDE_CLIENT_IDENTITY_HEADERS, ...headers };
}

export function headersToEntries(headers?: Record<string, string | undefined | null>): HeaderEntry[] {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ key, value: String(value) }));
}

export const normalizeHeaderEntries = (entries: HeaderEntry[]) =>
  (entries ?? [])
    .map((entry) => ({
      key: String(entry?.key ?? '').trim(),
      value: String(entry?.value ?? '').trim(),
    }))
    .filter((entry) => entry.key || entry.value)
    .sort((a, b) => {
      const byKey = a.key.toLowerCase().localeCompare(b.key.toLowerCase());
      if (byKey !== 0) return byKey;
      return a.value.localeCompare(b.value);
    });

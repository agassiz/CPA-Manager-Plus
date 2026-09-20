import { normalizeApiBase } from './connection';

export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

const hasHeader = (headers: Record<string, string>, name: string): boolean => {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const resolveBearerToken = (headers: Record<string, string>): string => {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  if (!value) return '';
  const match = String(value).trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

/**
 * Return whether a request targets Anthropic's first-party API origin.
 * Custom gateways often expose the same Claude paths but authenticate with
 * Authorization: Bearer instead of Anthropic's x-api-key header.
 */
export const isAnthropicFirstPartyEndpoint = (value: string): boolean => {
  const normalized = normalizeApiBase(value);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    const port = parsed.port;
    return (
      parsed.protocol.toLowerCase() === 'https:' &&
      parsed.username === '' &&
      parsed.hostname.toLowerCase() === 'api.anthropic.com' &&
      (port === '' || port === '443')
    );
  } catch {
    return false;
  }
};

/**
 * Build Claude request headers for both Anthropic and compatible gateways.
 * Explicit custom headers always win; the API key field fills missing auth
 * headers. Custom endpoints receive both common auth forms so gateways that
 * implement either Claude or OpenAI-style authentication can validate it.
 */
export const buildClaudeRequestHeaders = (
  endpoint: string,
  headers: Record<string, string> = {},
  apiKey?: string,
  authIndex?: string
): Record<string, string> => {
  const resolved = { ...headers };
  const trimmedApiKey = String(apiKey ?? '').trim();
  const trimmedAuthIndex = authIndex?.trim() || '';
  const hasApiKeyHeader = hasHeader(resolved, 'x-api-key');
  const hasAuthorization = hasHeader(resolved, 'authorization');
  const resolvedApiKey =
    trimmedApiKey || (!hasApiKeyHeader ? resolveBearerToken(resolved) : '');
  const isFirstParty = isAnthropicFirstPartyEndpoint(endpoint);

  if (isFirstParty) {
    if (resolvedApiKey && !hasApiKeyHeader) {
      resolved['x-api-key'] = resolvedApiKey;
    } else if (trimmedAuthIndex && !hasApiKeyHeader) {
      resolved['x-api-key'] = '$TOKEN$';
    }
  } else {
    if (resolvedApiKey && !hasApiKeyHeader) {
      resolved['x-api-key'] = resolvedApiKey;
    }
    if (resolvedApiKey && !hasAuthorization) {
      resolved.Authorization = `Bearer ${resolvedApiKey}`;
    }
    if (trimmedAuthIndex && !hasApiKeyHeader && !hasAuthorization) {
      resolved['x-api-key'] = '$TOKEN$';
      resolved.Authorization = 'Bearer $TOKEN$';
    }
  }

  if (!hasHeader(resolved, 'anthropic-version')) {
    resolved['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
  }

  return resolved;
};

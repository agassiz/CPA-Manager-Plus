import { describe, expect, it } from 'vitest';
import {
  buildClaudeRequestHeaders,
  isAnthropicFirstPartyEndpoint,
} from './claudeHeaders';

describe('Claude request authentication headers', () => {
  it('uses x-api-key for the first-party Anthropic endpoint', () => {
    const headers = buildClaudeRequestHeaders(
      'https://api.anthropic.com/v1/models',
      {},
      'sk-ant-test'
    );

    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('adds Bearer auth for a custom endpoint while retaining Claude auth compatibility', () => {
    const headers = buildClaudeRequestHeaders(
      'https://anyrouter.top/v1/models',
      {},
      'router-key'
    );

    expect(headers.Authorization).toBe('Bearer router-key');
    expect(headers['x-api-key']).toBe('router-key');
  });

  it('preserves explicit custom authentication headers', () => {
    const headers = buildClaudeRequestHeaders(
      'https://anyrouter.top/v1/models',
      { Authorization: 'Bearer custom-token', 'x-api-key': 'custom-key' },
      'field-key'
    );

    expect(headers.Authorization).toBe('Bearer custom-token');
    expect(headers['x-api-key']).toBe('custom-key');
  });

  it('uses the selected auth token placeholder for custom endpoints', () => {
    const headers = buildClaudeRequestHeaders(
      'https://anyrouter.top/v1/models',
      {},
      undefined,
      'auth-index'
    );

    expect(headers.Authorization).toBe('Bearer $TOKEN$');
    expect(headers['x-api-key']).toBe('$TOKEN$');
  });

  it('recognizes only the first-party Anthropic origin', () => {
    expect(isAnthropicFirstPartyEndpoint('https://api.anthropic.com/v1/models')).toBe(true);
    expect(isAnthropicFirstPartyEndpoint('https://api.anthropic.com:443/v1/models')).toBe(true);
    expect(isAnthropicFirstPartyEndpoint('https://api.anthropic.com:8443/v1/models')).toBe(false);
    expect(isAnthropicFirstPartyEndpoint('https://api.anthropic.com.example/v1/models')).toBe(false);
  });
});

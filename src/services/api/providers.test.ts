import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mocks.get,
    put: mocks.put,
  },
}));

import { providersApi } from './providers';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
});

describe('providersApi provider config serialization', () => {
  it('removes legacy auth-index fields while preserving unknown raw fields', async () => {
    mocks.get.mockResolvedValue({
      'codex-api-key': [
        {
          'auth-index': 'auth-1',
          'api-key': 'old-key',
          'base-url': 'https://old.example.com/v1',
          'raw-field': 'keep',
          models: [{ name: 'old-model', 'raw-model-field': true }],
        },
      ],
    });
    mocks.put.mockResolvedValue({});

    await providersApi.saveCodexConfigs([
      {
        apiKey: 'old-key',
        baseUrl: 'https://new.example.com/v1',
        models: [{ name: 'new-model', alias: 'alias' }],
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith('/codex-api-key', [
      {
        'raw-field': 'keep',
        'api-key': 'old-key',
        'base-url': 'https://new.example.com/v1',
        models: [{ name: 'new-model', alias: 'alias', 'raw-model-field': true }],
      },
    ]);
  });

  it('serializes Codex provider names', async () => {
    mocks.get.mockResolvedValue({ 'codex-api-key': [] });
    mocks.put.mockResolvedValue({});

    await providersApi.saveCodexConfigs([
      {
        name: 'Codex Team A',
        apiKey: 'sk-codex',
        baseUrl: 'https://codex.example.com/v1',
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith('/codex-api-key', [
      {
        name: 'Codex Team A',
        'api-key': 'sk-codex',
        'base-url': 'https://codex.example.com/v1',
      },
    ]);
  });

  it('removes legacy OpenAI auth-index entries and preserves raw provider fields', async () => {
    mocks.get.mockResolvedValue({
      'openai-compatibility': [
        {
          name: 'openai-compatible',
          'base-url': 'https://api.example.com/v1',
          'api-key-entries': [
            {
              'auth-index': 'auth-2',
              'api-key': 'old-key',
              'raw-entry-field': 'keep-entry',
            },
          ],
          'raw-provider-field': 'keep-provider',
        },
      ],
    });
    mocks.put.mockResolvedValue({});

    await providersApi.saveOpenAIProviders([
      {
        name: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKeyEntries: [{ apiKey: 'old-key' }],
        chatCompletionsOnly: true,
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith('/openai-compatibility', [
      {
        'raw-provider-field': 'keep-provider',
        name: 'openai-compatible',
        'base-url': 'https://api.example.com/v1',
        'chat-completions-only': true,
        'api-key-entries': [{ 'raw-entry-field': 'keep-entry', 'api-key': 'old-key' }],
      },
    ]);
  });

  it('normalizes OpenAI chat-completions-only option', async () => {
    mocks.get.mockResolvedValue({
      'openai-compatibility': [
        {
          name: 'openai-compatible',
          'base-url': 'https://api.example.com/v1',
          'chat-completions-only': true,
          'api-key-entries': [],
        },
      ],
    });

    const providers = await providersApi.getOpenAIProviders();

    expect(providers[0]?.chatCompletionsOnly).toBe(true);
  });

  it('serializes OpenAI chat-completions-only false explicitly', async () => {
    mocks.get.mockResolvedValue({ 'openai-compatibility': [] });
    mocks.put.mockResolvedValue({});

    await providersApi.saveOpenAIProviders([
      {
        name: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKeyEntries: [],
        chatCompletionsOnly: false,
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith('/openai-compatibility', [
      {
        name: 'openai-compatible',
        'base-url': 'https://api.example.com/v1',
        'api-key-entries': [],
        'chat-completions-only': false,
      },
    ]);
  });

  it('falls back to serialized payload when raw config loading fails', async () => {
    mocks.get.mockRejectedValue(new Error('forbidden'));
    mocks.put.mockResolvedValue({});

    await providersApi.saveGeminiKeys([{ apiKey: 'gemini-key' }]);

    expect(mocks.put).toHaveBeenCalledWith('/gemini-api-key', [{ 'api-key': 'gemini-key' }]);
  });

  it('serializes Claude cache optimization fields', async () => {
    mocks.get.mockResolvedValue({ 'claude-api-key': [] });
    mocks.put.mockResolvedValue({});

    await providersApi.saveClaudeConfigs([
      {
        name: 'Claude Team A',
        apiKey: 'sk-claude',
        experimentalCCHSigning: false,
        cloak: {
          mode: 'never',
          strictMode: false,
          cacheUserID: true,
        },
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith('/claude-api-key', [
      {
        name: 'Claude Team A',
        'api-key': 'sk-claude',
        'experimental-cch-signing': false,
        cloak: {
          mode: 'never',
          'strict-mode': false,
          'cache-user-id': true,
        },
      },
    ]);
  });

  it('normalizes Claude cache optimization fields', async () => {
    mocks.get.mockResolvedValue({
      'claude-api-key': [
        {
          name: 'Claude Team A',
          'api-key': 'sk-claude',
          'experimental-cch-signing': true,
          cloak: {
            mode: 'always',
            'cache-user-id': false,
          },
        },
      ],
    });

    await expect(providersApi.getClaudeConfigs()).resolves.toEqual([
      {
        name: 'Claude Team A',
        apiKey: 'sk-claude',
        experimentalCCHSigning: true,
        cloak: {
          mode: 'always',
          cacheUserID: false,
        },
      },
    ]);
  });

  it('adds xAI keys without dropping concurrent or unknown backend fields', async () => {
    mocks.get.mockResolvedValue({
      'xai-api-key': [
        {
          'api-key': 'existing',
          'base-url': 'https://api.x.ai/v1',
          'future-field': 'keep',
        },
        { 'api-key': 'concurrent', 'base-url': 'https://api.x.ai/v1' },
      ],
    });
    mocks.put.mockResolvedValue({});

    await providersApi.createXAIConfig({
      apiKey: 'new-xai',
      baseUrl: 'https://api.x.ai/v1',
      websockets: true,
      disableCooling: true,
    });

    expect(mocks.put).toHaveBeenCalledWith('/xai-api-key', [
      {
        'api-key': 'existing',
        'base-url': 'https://api.x.ai/v1',
        'future-field': 'keep',
      },
      { 'api-key': 'concurrent', 'base-url': 'https://api.x.ai/v1' },
      {
        'api-key': 'new-xai',
        'base-url': 'https://api.x.ai/v1',
        websockets: true,
        'disable-cooling': true,
      },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('./client', () => ({
  apiClient: mocks,
}));

import { apiKeyAccessApi } from './apiKeyAccess';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
});

describe('apiKeyAccessApi', () => {
  it('normalizes loaded rules', async () => {
    mocks.get.mockResolvedValue({
      items: [{ 'api-key': ' client ', models: [' GPT-5.5 ', 'gpt-5.5'], 'auth-ids': [' auth-1 ', 'auth-1'], providers: ['Gemini', 'gemini'] }],
    });

    await expect(apiKeyAccessApi.list()).resolves.toEqual([
      { apiKey: 'client', models: ['gpt-5.5'], authIds: ['auth-1'], providers: ['gemini'] },
    ]);
    expect(mocks.get).toHaveBeenCalledWith('/api-key-access');
  });

  it('replaces all rules with the management payload', async () => {
    await apiKeyAccessApi.replace([{ apiKey: 'client', models: ['GPT-5.5'], authIds: ['auth-1'], providers: ['Gemini'] }]);

    expect(mocks.put).toHaveBeenCalledWith('/api-key-access', {
      items: [{ 'api-key': 'client', models: ['gpt-5.5'], 'auth-ids': ['auth-1'], providers: ['gemini'] }],
    });
  });

  it('loads all access-rule options without exposing or using credential secrets', async () => {
    mocks.get.mockResolvedValue({
      providers: [
        {
          id: 'openai-compatibility:deepseek',
          type: 'OpenAI 兼容',
          name: 'deepseek',
          enabled: true,
        },
      ],
      credentials: [
        { id: 'runtime-codex', name: 'Codex Team', provider: 'Codex', status: 'active' },
        { id: '', name: 'invalid', provider: 'gemini', status: 'active' },
      ],
    });

    await expect(apiKeyAccessApi.options()).resolves.toEqual({
      providers: [
        {
          id: 'openai-compatibility:deepseek',
          type: 'OpenAI 兼容',
          name: 'deepseek',
          enabled: true,
        },
      ],
      credentials: [
        { id: 'runtime-codex', name: 'Codex Team', provider: 'codex', status: 'active' },
      ],
    });
    expect(mocks.get).toHaveBeenCalledWith('/api-key-access/options');
  });
});

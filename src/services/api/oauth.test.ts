import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./client', () => ({
  apiClient: mocks,
}));

import { oauthApi } from './oauth';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.delete.mockReset();
});

describe('oauthApi Meta and Devin support', () => {
  it('starts Meta device login without web callback mode', async () => {
    mocks.get.mockResolvedValue({
      url: 'https://example.test/device',
      state: 'meta-state',
      user_code: 'META-CODE',
    });

    await expect(oauthApi.startAuth('meta')).resolves.toMatchObject({ user_code: 'META-CODE' });
    expect(mocks.get).toHaveBeenCalledWith('/meta-auth-url', { params: undefined });
  });

  it('starts and cancels a Devin web login session', async () => {
    mocks.get.mockResolvedValue({ url: 'https://example.test/login', state: 'devin-state' });
    mocks.delete.mockResolvedValue({ status: 'ok', cancelled: true });

    await oauthApi.startAuth('devin');
    await oauthApi.cancelSession('devin-state');

    expect(mocks.get).toHaveBeenCalledWith('/devin-auth-url', {
      params: { is_webui: true },
    });
    expect(mocks.delete).toHaveBeenCalledWith('/oauth-session', {
      params: { state: 'devin-state' },
    });
  });
});

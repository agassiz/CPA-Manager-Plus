import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    request: vi.fn(),
    downloadText: vi.fn(),
  },
}));

vi.mock('@/services/api/apiCall', () => ({
  apiCallApi: { request: mocks.request },
  getApiCallErrorMessage: () => 'request failed',
}));

vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: { downloadText: mocks.downloadText },
}));

import { fetchCopilotQuota } from './providerRequests';

const t = (key: string) => key;
const file = { name: 'copilot.json', provider: 'copilot', auth_index: '5' };
const credential = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'copilot',
    refresh_token: 'gho_fixture-only',
    access_token: 'inference-only',
    username: 'fixture-account',
    ...overrides,
  });
const quotaBody = {
  login: 'fixture-account',
  quota_snapshots: {
    premium_interactions: { quota_remaining: 120, entitlement: 300, percent_remaining: 40 },
  },
};

beforeEach(() => {
  mocks.request.mockReset();
  mocks.downloadText.mockReset();
});

describe('Copilot quota request', () => {
  it('downloads the credential and sends only its GitHub OAuth token to the quota endpoint', async () => {
    mocks.downloadText.mockResolvedValue(credential());
    mocks.request.mockResolvedValue({ statusCode: 200, body: quotaBody, bodyText: '' });

    const quota = await fetchCopilotQuota(file, t as never);

    expect(mocks.downloadText).toHaveBeenCalledWith('copilot.json');
    expect(mocks.request).toHaveBeenCalledWith({
      authIndex: '5',
      method: 'GET',
      url: 'https://api.github.com/copilot_internal/user',
      header: {
        Authorization: 'Bearer gho_fixture-only',
        'User-Agent': 'copilot/1.0.114',
        Accept: 'application/json',
      },
    });
    expect(quota).toEqual({ remaining: 120, entitlement: 300, percentRemaining: 40 });
  });

  it('never downloads credentials without an auth index or for runtime-only files', async () => {
    await expect(
      fetchCopilotQuota({ name: 'copilot.json', provider: 'copilot' }, t as never)
    ).rejects.toThrow('copilot_quota.unavailable');
    await expect(fetchCopilotQuota({ ...file, runtime_only: true }, t as never)).rejects.toThrow(
      'copilot_quota.unavailable'
    );
    expect(mocks.downloadText).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('rejects credentials of another type without forwarding them', async () => {
    mocks.downloadText.mockResolvedValue(credential({ type: 'kimi' }));

    await expect(fetchCopilotQuota(file, t as never)).rejects.toThrow('copilot_quota.unavailable');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed GitHub tokens without forwarding them', async () => {
    for (const overrides of [
      { refresh_token: undefined },
      { refresh_token: 'gho bad token' },
      { refresh_token: 'gho_fixture\nInjected: header' },
      { refresh_token: '' },
    ]) {
      mocks.downloadText.mockResolvedValue(credential(overrides));
      await expect(fetchCopilotQuota(file, t as never)).rejects.toThrow(
        'copilot_quota.unavailable'
      );
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('maps non-2xx responses to the generic message without upstream details', async () => {
    mocks.downloadText.mockResolvedValue(credential());
    mocks.request.mockResolvedValue({
      statusCode: 401,
      body: { message: 'Bad credentials gho_fixture-only' },
      bodyText: '',
    });

    await expect(fetchCopilotQuota(file, t as never)).rejects.toEqual(
      new Error('copilot_quota.unavailable')
    );
  });

  it('does not expose download or transport errors that may contain the token', async () => {
    mocks.downloadText.mockRejectedValueOnce(new Error('gho_fixture-only'));
    await expect(fetchCopilotQuota(file, t as never)).rejects.toEqual(
      new Error('copilot_quota.unavailable')
    );

    mocks.downloadText.mockResolvedValue(credential());
    mocks.request.mockRejectedValueOnce(new Error('Bearer gho_fixture-only'));
    await expect(fetchCopilotQuota(file, t as never)).rejects.toEqual(
      new Error('copilot_quota.unavailable')
    );
  });

  it('treats an unparseable 2xx body as unavailable', async () => {
    mocks.downloadText.mockResolvedValue(credential());
    mocks.request.mockResolvedValue({
      statusCode: 200,
      body: { quota_snapshots: { premium_interactions: { unlimited: true } } },
      bodyText: '',
    });

    await expect(fetchCopilotQuota(file, t as never)).rejects.toThrow('copilot_quota.unavailable');
  });
});

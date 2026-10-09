import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    request: vi.fn(),
  },
}));

vi.mock('@/services/api/apiCall', () => ({
  apiCallApi: { request: mocks.request },
  getApiCallErrorMessage: () => 'request failed',
}));

vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: { downloadText: vi.fn() },
}));

import { fetchClineQuota } from './providerRequests';

const t = (key: string) => key;
const file = { name: 'cline.json', provider: 'cline', auth_index: '12' };

beforeEach(() => {
  mocks.request.mockReset();
});

describe('Cline credit balance request', () => {
  it('resolves the account id, then reads the balance with the workos-prefixed placeholder', async () => {
    mocks.request
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { success: true, data: { id: 'usr/01', email: 'a@example.com' } },
        bodyText: '',
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { success: true, data: { userId: 'usr/01', balance: 49635 } },
        bodyText: '',
      });

    const balance = await fetchClineQuota(file, t as never);

    expect(balance).toEqual({ balanceMicroUsd: 49635 });
    expect(mocks.request).toHaveBeenNthCalledWith(1, {
      authIndex: '12',
      method: 'GET',
      url: 'https://api.cline.bot/api/v1/users/me',
      header: { Authorization: 'Bearer workos:$TOKEN$', Accept: 'application/json' },
    });
    expect(mocks.request).toHaveBeenNthCalledWith(2, {
      authIndex: '12',
      method: 'GET',
      url: 'https://api.cline.bot/api/v1/users/usr%2F01/balance',
      header: { Authorization: 'Bearer workos:$TOKEN$', Accept: 'application/json' },
    });
  });

  it('requires an auth index', async () => {
    await expect(fetchClineQuota({ name: 'cline.json', provider: 'cline' }, t as never)).rejects.toThrow(
      'cline_quota.missing_auth_index'
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('reports an upstream status failure without calling the balance endpoint', async () => {
    mocks.request.mockResolvedValueOnce({ statusCode: 401, body: null, bodyText: '' });

    await expect(fetchClineQuota(file, t as never)).rejects.toMatchObject({ status: 401 });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when the responses do not match the contract', async () => {
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      body: { success: true, data: {} },
      bodyText: '',
    });
    await expect(fetchClineQuota(file, t as never)).rejects.toThrow('cline_quota.empty_data');

    mocks.request.mockReset();
    mocks.request
      .mockResolvedValueOnce({ statusCode: 200, body: { success: true, data: { id: 'u' } }, bodyText: '' })
      .mockResolvedValueOnce({ statusCode: 200, body: { success: true, data: {} }, bodyText: '' });
    await expect(fetchClineQuota(file, t as never)).rejects.toThrow('cline_quota.empty_data');
  });
});

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

import { fetchDevinQuota, fetchMetaQuota } from './providerRequests';

const t = (key: string) => key;

beforeEach(() => {
  mocks.request.mockReset();
  mocks.downloadText.mockReset();
});

describe('Meta quota request', () => {
  it('downloads the credential and sends only its DCA token to the Muse quota endpoint', async () => {
    mocks.downloadText.mockResolvedValue(
      JSON.stringify({ dca_token: ' dca:fixture-only ', api_key: 'LLM|unused' })
    );
    mocks.request.mockResolvedValue({
      statusCode: 200,
      body: {
        subs_usage: { weekly: { used_percent: 25 } },
        api_key: 'must-not-propagate',
      },
      bodyText: '',
    });

    const quota = await fetchMetaQuota(
      { name: 'meta.json', provider: 'meta', auth_index: '7' },
      t as never
    );

    expect(mocks.downloadText).toHaveBeenCalledWith('meta.json');
    expect(mocks.request).toHaveBeenCalledWith({
      authIndex: '7',
      method: 'POST',
      url: 'https://api.meta.ai/muse-code/key',
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer dca:fixture-only',
        'x-api-version': '1.0.0',
      },
      data: '{}',
    });
    expect(quota.windows[1]?.usedPercent).toBe(25);
    expect(JSON.stringify(quota)).not.toContain('dca:');
    expect(JSON.stringify(quota)).not.toContain('must-not-propagate');
  });

  it('does not expose credential download errors', async () => {
    mocks.downloadText.mockRejectedValue(new Error('dca:secret'));

    await expect(
      fetchMetaQuota({ name: 'meta.json', provider: 'meta', auth_index: '7' }, t as never)
    ).rejects.toThrow('meta_quota.download_failed');
  });
});

describe('Devin quota request', () => {
  it('uses the credential placeholder and normalizes the returned quota', async () => {
    mocks.request.mockResolvedValue({
      statusCode: 200,
      body: {
        userStatus: {
          planStatus: {
            planInfo: { planName: 'Pro' },
            dailyQuotaRemainingPercent: 40,
            weeklyQuotaRemainingPercent: 60,
          },
        },
      },
      bodyText: '',
    });

    const quota = await fetchDevinQuota(
      { name: 'devin.json', provider: 'devin', auth_index: '9' },
      t as never
    );

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        authIndex: '9',
        method: 'POST',
        url: 'https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus',
        header: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
        },
      })
    );
    expect(JSON.parse(mocks.request.mock.calls[0][0].data).metadata.apiKey).toBe('$TOKEN$');
    expect(quota.plan).toBe('Pro');
    expect(quota.windows.map((window) => window.remainingPercent)).toEqual([40, 60]);
  });
});

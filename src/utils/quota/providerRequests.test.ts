import { describe, expect, it, vi } from 'vitest';
import { XAI_CREDITS_BILLING_URL, XAI_USER_URL } from './constants';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('@/services/api/apiCall', () => ({
  apiCallApi: { request: requestMock },
  getApiCallErrorMessage: () => 'request failed',
}));

import { buildXaiBillingSummary, fetchXaiQuota } from './providerRequests';

const t = (key: string) => key;

describe('xAI quota requests', () => {
  it('uses Grok Build included usage for free accounts', () => {
    const summary = buildXaiBillingSummary(
      {
        monthlyLimit: { val: 0 },
        creditUsagePercent: 24,
        currentPeriod: { end: '2026-08-08T00:00:00Z' },
        productUsage: [{ product: 'GrokBuild', usagePercent: 18 }],
      },
      'Free'
    );

    expect(summary).toMatchObject({
      monthlyLimitCents: 0,
      usedPercent: 18,
      billingPeriodEnd: '2026-08-08T00:00:00Z',
      subscriptionTier: 'Free',
      usesIncludedUsage: true,
    });
  });

  it('keeps monetary billing percentages for paid accounts', () => {
    const summary = buildXaiBillingSummary({
      monthlyLimit: { val: 10_000 },
      used: { val: 2_500 },
      creditUsagePercent: 80,
    });

    expect(summary).toMatchObject({
      usedPercent: 25,
      usesIncludedUsage: false,
    });
  });

  it('uses the OAuth user id for the detailed credits endpoint', async () => {
    requestMock.mockReset();
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, body: { userId: 'user-123' }, bodyText: '' })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: {
          subscriptionTier: 'Free',
          config: {
            monthlyLimit: { val: 0 },
            productUsage: [{ product: 'GrokBuild', usagePercent: 12 }],
          },
        },
        bodyText: '',
      });

    const summary = await fetchXaiQuota({ name: 'xai-free.json', auth_index: '7' }, t as never);

    expect(summary).toMatchObject({ usedPercent: 12, usesIncludedUsage: true });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ authIndex: '7', url: XAI_USER_URL })
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        authIndex: '7',
        url: XAI_CREDITS_BILLING_URL,
        header: expect.objectContaining({ 'x-userid': 'user-123' }),
      })
    );
  });

  it('falls back to the original billing endpoint when user lookup is unavailable', async () => {
    requestMock.mockReset();
    requestMock
      .mockResolvedValueOnce({ statusCode: 403, body: { error: 'OAuth required' }, bodyText: '' })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { config: { monthlyLimit: { val: 10_000 }, used: { val: 2_500 } } },
        bodyText: '',
      });

    const summary = await fetchXaiQuota({ name: 'xai-api-key.json', auth_index: '8' }, t as never);

    expect(summary).toMatchObject({ usedPercent: 25, usesIncludedUsage: false });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ authIndex: '8', url: 'https://cli-chat-proxy.grok.com/v1/billing' })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANTIGRAVITY_CODE_ASSIST_URLS } from './constants';

const { requestMock, downloadTextMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  downloadTextMock: vi.fn(),
}));

vi.mock('@/services/api/apiCall', () => ({
  apiCallApi: { request: requestMock },
  getApiCallErrorMessage: () => 'request failed',
}));

vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: { downloadText: downloadTextMock },
}));

import { fetchAntigravityQuota, resolveAntigravityTierBadge } from './providerRequests';
import { buildAntigravityQuotaGroups } from './builders';

const t = (key: string) => key;
const file = { name: 'antigravity-a.json', type: 'antigravity', auth_index: 'idx-1' };

const mockResponses = (codeAssistBody: unknown) => {
  requestMock.mockImplementation(async ({ url }: { url: string }) => {
    if (ANTIGRAVITY_CODE_ASSIST_URLS.includes(url)) {
      return { statusCode: 200, body: codeAssistBody, bodyText: '' };
    }
    return {
      statusCode: 200,
      body: {
        models: {
          'claude-sonnet-4-6': {
            displayName: 'Claude Sonnet 4.6',
            quotaInfo: { remainingFraction: 1, resetTime: '2026-11-27T12:46:00Z' },
          },
        },
      },
      bodyText: '',
    };
  });
};

describe('antigravity tier', () => {
  beforeEach(() => {
    requestMock.mockReset();
    downloadTextMock.mockReset();
    downloadTextMock.mockResolvedValue(JSON.stringify({ project_id: 'poised-palisade-9h7sp' }));
  });

  it('maps tier ids to plan badges', () => {
    expect(resolveAntigravityTierBadge('g1-ultra-tier')).toBe('ULTRA');
    expect(resolveAntigravityTierBadge('g1-pro-tier')).toBe('PRO');
    expect(resolveAntigravityTierBadge('free-tier')).toBe('FREE');
    expect(resolveAntigravityTierBadge('standard-tier')).toBe('FREE');
    expect(resolveAntigravityTierBadge(null)).toBeNull();
    expect(resolveAntigravityTierBadge('  ')).toBeNull();
  });

  it('prefers paidTier over currentTier from loadCodeAssist', async () => {
    mockResponses({ currentTier: { id: 'standard-tier' }, paidTier: { id: 'g1-pro-tier' } });

    const quota = await fetchAntigravityQuota(file, t as never);

    expect(quota.tierId).toBe('g1-pro-tier');
    expect(quota.groups.length).toBeGreaterThan(0);
  });

  it('falls back to currentTier when there is no paid tier', async () => {
    mockResponses({ currentTier: { id: 'free-tier' } });

    const quota = await fetchAntigravityQuota(file, t as never);

    expect(quota.tierId).toBe('free-tier');
    expect(quota.creditBalance).toBeNull();
  });
});

describe('antigravity quota groups', () => {
  it('shows a Gemini 4 group using the lowest remaining model', () => {
    const groups = buildAntigravityQuotaGroups({
      'gemini-4-hydrogen-sonar': {
        quotaInfo: { remainingFraction: 0.86, resetTime: '2026-11-20T17:27:53Z' },
      },
      'gemini-4-argon-high': {
        displayName: 'Gemini 4 Argon (High)',
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-11-20T17:27:53Z' },
      },
    } as never);

    const gemini4 = groups.find((group) => group.id === 'gemini-4');
    expect(gemini4).toMatchObject({ label: 'Gemini 4', remainingFraction: 0.5 });
  });

  it('does not show Gemini 4 for the internal hydrogen-sonar model alone', () => {
    const groups = buildAntigravityQuotaGroups({
      'gemini-4-hydrogen-sonar': { quotaInfo: { remainingFraction: 0.78 } },
      'gemini-3-flash': { displayName: 'Gemini 3 Flash', quotaInfo: { remainingFraction: 0.78 } },
    } as never);

    expect(groups.some((group) => group.id === 'gemini-4')).toBe(false);
  });
});

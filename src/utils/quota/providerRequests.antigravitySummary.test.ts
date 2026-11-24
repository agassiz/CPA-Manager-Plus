import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANTIGRAVITY_CODE_ASSIST_URLS,
  ANTIGRAVITY_QUOTA_SUMMARY_URLS,
  ANTIGRAVITY_QUOTA_URLS,
} from './constants';

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

import { fetchAntigravityQuota } from './providerRequests';
import {
  buildAntigravityQuotaSummaryGroups,
  parseStoredAntigravityQuotaSummaryGroups,
} from './builders';

const t = (key: string) => key;
const file = { name: 'antigravity-a.json', type: 'antigravity', auth_index: 'idx-1' };

// retrieveUserQuotaSummary of a Pro account, captured from Antigravity 2.34.0.
const proSummary = {
  groups: [
    {
      displayName: 'Gemini Models',
      buckets: [
        {
          bucketId: 'gemini-weekly',
          displayName: 'Weekly Limit Remaining',
          window: 'weekly',
          resetTime: '2026-11-28T10:12:00Z',
          remainingFraction: 0.324416,
        },
        {
          bucketId: 'gemini-5h',
          displayName: 'Five Hour Limit Remaining',
          window: '5h',
          resetTime: '2026-11-23T22:09:54Z',
          remainingFraction: 1,
        },
      ],
    },
    {
      displayName: 'Claude and GPT models',
      buckets: [
        {
          bucketId: '3p-weekly',
          window: 'weekly',
          resetTime: '2026-11-25T06:55:39Z',
          remainingFraction: 0.2623528,
        },
        {
          bucketId: '3p-5h',
          window: '5h',
          resetTime: '2026-11-23T17:27:34Z',
          remainingFraction: 0,
        },
      ],
    },
    {
      displayName: 'Gemini 4 Argon',
      buckets: [
        {
          bucketId: 'gemini-argon-wtu-weekly',
          window: 'weekly',
          resetTime: '2026-11-28T10:04:12Z',
          remainingFraction: 0.2153752,
        },
      ],
    },
  ],
};

const modelsBody = {
  models: {
    'claude-sonnet-4-6': { quotaInfo: { remainingFraction: 0, resetTime: '2026-11-23T17:27:34Z' } },
  },
};

const mockResponses = (summary: { statusCode: number; body: unknown }) => {
  requestMock.mockImplementation(async ({ url }: { url: string }) => {
    if (ANTIGRAVITY_CODE_ASSIST_URLS.includes(url)) {
      return { statusCode: 200, body: { paidTier: { id: 'g1-pro-tier' } }, bodyText: '' };
    }
    if (ANTIGRAVITY_QUOTA_SUMMARY_URLS.includes(url)) {
      return { ...summary, bodyText: '' };
    }
    return { statusCode: 200, body: modelsBody, bodyText: '' };
  });
};

describe('antigravity usage summary groups', () => {
  it('follows the summary groups and puts the weekly limit first', () => {
    const groups = buildAntigravityQuotaSummaryGroups(proSummary);

    expect(groups.map((group) => [group.id, group.label])).toEqual([
      ['gemini', 'Gemini Models'],
      ['3p', 'Claude and GPT models'],
      ['gemini-argon-wtu', 'Gemini 4 Argon'],
    ]);
    expect(groups[1]).toMatchObject({
      remainingFraction: 0.2623528,
      resetTime: '2026-11-25T06:55:39Z',
    });
    expect(groups[1].windows?.map((window) => [window.window, window.remainingFraction])).toEqual([
      ['weekly', 0.2623528],
      ['5h', 0],
    ]);
    expect(groups[2].windows).toHaveLength(1);
  });

  it('ignores unusable summaries', () => {
    expect(buildAntigravityQuotaSummaryGroups(null)).toEqual([]);
    expect(
      buildAntigravityQuotaSummaryGroups({ groups: [{ displayName: 'X', buckets: [] }] })
    ).toEqual([]);
    expect(
      buildAntigravityQuotaSummaryGroups({
        groups: [{ displayName: 'X', buckets: [{ window: 'weekly', remainingFraction: 1.4 }] }],
      })
    ).toEqual([
      {
        id: 'x',
        label: 'X',
        models: [],
        remainingFraction: 1,
        windows: [{ id: '', window: 'weekly', label: '', remainingFraction: 1 }],
      },
    ]);
  });

  it('parses the summary the server stored on the auth file', () => {
    const stored = [
      {
        id: '3p',
        label: 'Claude and GPT models',
        remainingFraction: 0.26,
        resetTime: '2026-11-25T06:55:39Z',
        windows: [
          {
            id: '3p-weekly',
            window: 'weekly',
            label: 'Weekly Limit Remaining',
            remainingFraction: 0.26,
            resetTime: '2026-11-25T06:55:39Z',
          },
          {
            id: '3p-5h',
            window: '5h',
            label: 'Five Hour Limit Remaining',
            remainingFraction: 0,
            resetTime: '2026-11-23T17:27:34Z',
          },
        ],
      },
      { id: 'broken', label: 'No windows', windows: [] },
    ];

    const groups = parseStoredAntigravityQuotaSummaryGroups(stored);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: '3p',
      remainingFraction: 0.26,
      resetTime: '2026-11-25T06:55:39Z',
    });
    expect(groups[0].windows?.[1]).toMatchObject({ window: '5h', remainingFraction: 0 });
    expect(parseStoredAntigravityQuotaSummaryGroups('nope')).toEqual([]);
  });
});

describe('antigravity quota refresh with the usage summary', () => {
  beforeEach(() => {
    requestMock.mockReset();
    downloadTextMock.mockReset();
    downloadTextMock.mockResolvedValue(JSON.stringify({ project_id: 'secure-goal-3tg97' }));
  });

  it('shows the usage summary and still refreshes fetchAvailableModels', async () => {
    mockResponses({ statusCode: 200, body: proSummary });

    const quota = await fetchAntigravityQuota(file, t as never);

    expect(quota.groups.map((group) => group.id)).toEqual(['gemini', '3p', 'gemini-argon-wtu']);
    const urls = requestMock.mock.calls.map(([request]) => request.url);
    expect(urls).toContain(ANTIGRAVITY_QUOTA_SUMMARY_URLS[0]);
    expect(urls).toContain(ANTIGRAVITY_QUOTA_URLS[0]);
    const summaryCall = requestMock.mock.calls.find(
      ([request]) => request.url === ANTIGRAVITY_QUOTA_SUMMARY_URLS[0]
    );
    expect(summaryCall?.[0]).toMatchObject({
      method: 'POST',
      data: JSON.stringify({ project: 'aicode-consumers' }),
    });
  });

  it('falls back to the per-model groups when the summary is unavailable', async () => {
    mockResponses({ statusCode: 404, body: { error: { code: 404 } } });

    const quota = await fetchAntigravityQuota(file, t as never);

    expect(quota.groups.length).toBeGreaterThan(0);
    expect(quota.groups.every((group) => group.windows === undefined)).toBe(true);
  });

  it('shows the summary when fetchAvailableModels fails', async () => {
    requestMock.mockImplementation(async ({ url }: { url: string }) => {
      if (ANTIGRAVITY_QUOTA_SUMMARY_URLS.includes(url)) {
        return { statusCode: 200, body: proSummary, bodyText: '' };
      }
      if (ANTIGRAVITY_QUOTA_URLS.includes(url)) {
        return { statusCode: 500, body: {}, bodyText: '' };
      }
      return { statusCode: 200, body: {}, bodyText: '' };
    });

    const quota = await fetchAntigravityQuota(file, t as never);

    expect(quota.groups.map((group) => group.id)).toEqual(['gemini', '3p', 'gemini-argon-wtu']);
  });
});

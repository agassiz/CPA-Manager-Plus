import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { COPILOT_CONFIG } from './quotaConfigs';
import type { QuotaRenderHelpers } from './QuotaCard';

const t = ((key: string, options?: { percent?: number }) =>
  options?.percent === undefined ? key : `${key}:${options.percent}`) as unknown as TFunction;
const helpers = {
  styles: {},
  QuotaProgressBar: () => null,
} as unknown as QuotaRenderHelpers;
const render = (quota: Parameters<typeof COPILOT_CONFIG.renderQuotaItems>[0]) =>
  renderToStaticMarkup(COPILOT_CONFIG.renderQuotaItems(quota, t, helpers) as ReactElement);

describe('Copilot quota config', () => {
  it('selects only enabled Copilot credentials', () => {
    expect(COPILOT_CONFIG.filterFn({ name: 'copilot.json', type: 'copilot' })).toBe(true);
    expect(COPILOT_CONFIG.filterFn({ name: 'kimi.json', type: 'kimi' })).toBe(false);
    expect(COPILOT_CONFIG.filterFn({ name: 'off.json', type: 'copilot', disabled: true })).toBe(
      false
    );
  });

  it('uses a dedicated store and premium quota state builders', () => {
    expect(COPILOT_CONFIG.storeSetter).toBe('setCopilotQuota');
    expect(
      COPILOT_CONFIG.buildSuccessState({ remaining: 0, entitlement: 300, percentRemaining: 0 })
    ).toEqual({
      status: 'success',
      data: { remaining: 0, entitlement: 300, percentRemaining: 0 },
    });
    expect(COPILOT_CONFIG.buildErrorState('boom', 401, true)).toEqual({
      status: 'error',
      error: 'boom',
      errorStatus: 401,
      upstreamError: true,
    });
  });

  it('renders premium remaining, entitlement and percent', () => {
    const html = render({
      status: 'success',
      data: { remaining: 120, entitlement: 300, percentRemaining: 40.04 },
    });
    expect(html).toContain('copilot_quota.premium');
    expect(html).toContain('copilot_quota.remaining:40');
    expect(html).toContain('120 / 300');
    expect(render({ status: 'success' })).toContain('copilot_quota.unavailable');
  });
});

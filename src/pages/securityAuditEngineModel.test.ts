import { describe, expect, it } from 'vitest';
import type { SecurityAuditConfig } from '@/services/api/securityAudit';
import { hydrateEngineBlocks, setEngineEnabled } from './securityAuditEngineModel';

const guardDefaults = {
  enabled: false,
  'base-url': '',
  model: 'qwen3guard:0.6b',
  'timeout-ms': 5000,
  'input-limit': 12000,
  'max-concurrency': 2,
  'max-waiting': 64,
  scanners: ['jailbreak'],
};

const moderationsDefaults = {
  enabled: false,
  'base-url': 'https://api.openai.com',
  model: 'omni-moderation-latest',
  'timeout-ms': 5000,
  'input-limit': 12000,
  'max-concurrency': 8,
  'max-waiting': 64,
  categories: ['hate'],
  thresholds: { hate: 0.65 },
  'usage-price-per-million-input-tokens': 0,
};

const unconfiguredModerations = {
  ...moderationsDefaults,
  'base-url': '',
  model: '',
  'timeout-ms': 0,
  'input-limit': 0,
  'max-concurrency': 0,
  'max-waiting': 0,
  categories: [],
  thresholds: {},
};

const baseConfig = (overrides: Partial<SecurityAuditConfig> = {}): SecurityAuditConfig => ({
  enabled: true,
  'audit-third-party': false,
  'blocking-enabled': true,
  'blocking-latest-turn-only': false,
  'store-pass-events': false,
  'max-events': 500,
  rules: [],
  engine: 'qwen3guard',
  guard: { ...guardDefaults, 'base-url': 'http://127.0.0.1:11434', enabled: true },
  moderations: unconfiguredModerations,
  'engine-defaults': { guard: guardDefaults, moderations: moderationsDefaults },
  ...overrides,
});

describe('hydrateEngineBlocks', () => {
  it('seeds an unconfigured block from the backend engine defaults', () => {
    const next = hydrateEngineBlocks(baseConfig());

    expect(next.moderations).toEqual(moderationsDefaults);
    expect(next.guard['base-url']).toBe('http://127.0.0.1:11434');
  });

  it('never changes an enabled flag while seeding', () => {
    const next = hydrateEngineBlocks(
      baseConfig({ moderations: { ...unconfiguredModerations, enabled: true } })
    );

    expect(next.moderations.enabled).toBe(true);
    expect(next.moderations.model).toBe('omni-moderation-latest');
    expect(next.guard.enabled).toBe(true);
  });

  it('leaves a configured block untouched', () => {
    const configured = baseConfig({
      moderations: { ...moderationsDefaults, 'base-url': 'https://proxy.example.com' },
    });

    expect(hydrateEngineBlocks(configured).moderations['base-url']).toBe(
      'https://proxy.example.com'
    );
  });

  it('changes nothing when the backend did not send defaults', () => {
    const withoutDefaults = baseConfig({ 'engine-defaults': undefined });

    expect(hydrateEngineBlocks(withoutDefaults).moderations.model).toBe('');
  });
});

describe('setEngineEnabled', () => {
  it('disables the other engine and selects the one being enabled', () => {
    const next = setEngineEnabled(
      hydrateEngineBlocks(baseConfig()),
      'openai_moderations',
      true
    );

    expect(next.engine).toBe('openai_moderations');
    expect(next.moderations.enabled).toBe(true);
    expect(next.guard.enabled).toBe(false);
    expect(next.guard['base-url']).toBe('http://127.0.0.1:11434');
  });

  it('only clears its own flag when disabling', () => {
    const enabled = setEngineEnabled(
      hydrateEngineBlocks(baseConfig()),
      'openai_moderations',
      true
    );
    const disabled = setEngineEnabled(enabled, 'openai_moderations', false);

    expect(disabled.moderations.enabled).toBe(false);
    expect(disabled.guard.enabled).toBe(false);
    expect(disabled.engine).toBe('openai_moderations');
  });

  it('preserves every setting of both blocks', () => {
    const configured = hydrateEngineBlocks(
      baseConfig({
        moderations: { ...moderationsDefaults, 'base-url': 'https://proxy.example.com' },
      })
    );

    const next = setEngineEnabled(configured, 'openai_moderations', true);
    expect(next.moderations['base-url']).toBe('https://proxy.example.com');
    expect(next.moderations.thresholds).toEqual({ hate: 0.65 });

    const back = setEngineEnabled(next, 'qwen3guard', true);
    expect(back.engine).toBe('qwen3guard');
    expect(back.guard.enabled).toBe(true);
    expect(back.moderations.enabled).toBe(false);
    expect(back.moderations['base-url']).toBe('https://proxy.example.com');
  });
});

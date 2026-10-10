import { describe, expect, it } from 'vitest';
import {
  applyDiscoveredModels,
  emptyModel,
  emptySponsorForm,
  emptySponsorKeyEntry,
  formatUsageAmount,
  isHealthyUsageSummary,
  sponsorKeyEntriesFromRaw,
} from './sponsorForm';
import { getSponsorProviderDefinition } from './sponsorDefinitions';

describe('sponsor form state helpers', () => {
  const definition = getSponsorProviderDefinition('kimi');

  it('starts a new sponsor form with one empty key entry on the default protocol', () => {
    const form = emptySponsorForm(definition);
    expect(form.sponsorKeyEntries).toHaveLength(1);
    expect(form.sponsorKeyEntries?.[0]).toMatchObject({
      protocol: definition.defaultProtocol,
      apiKey: '',
      models: [emptyModel()],
    });
  });

  it('falls back to a single empty entry when nothing is configured yet', () => {
    expect(sponsorKeyEntriesFromRaw(null, definition)).toEqual([emptySponsorKeyEntry(definition)]);
  });

  it('adds discovered models once and drops the empty placeholder row', () => {
    const merged = applyDiscoveredModels(
      [emptyModel(), { name: 'kept', alias: 'k' }],
      [
        { name: 'kept', alias: 'ignored' },
        { name: 'fresh', alias: ' f ' },
      ]
    );
    expect(merged).toEqual([
      { name: 'kept', alias: 'k' },
      { name: 'fresh', alias: 'f' },
    ]);
  });

  it('keeps the current models when discovery returns nothing', () => {
    const current = [{ name: 'only', alias: '' }];
    expect(applyDiscoveredModels(current, [])).toBe(current);
  });

  it('formats usage amounts and judges key health', () => {
    expect(formatUsageAmount(null, 'en')).toBe('--');
    expect(formatUsageAmount(1234.5, 'en')).toBe('1,234.5');
    expect(
      isHealthyUsageSummary({
        isValid: true,
        status: 'active',
        remaining: 1,
        used: 0,
        limit: 1,
        unit: 'USD',
      })
    ).toBe(true);
    expect(
      isHealthyUsageSummary({
        isValid: true,
        status: 'expired',
        remaining: 0,
        used: 1,
        limit: 1,
        unit: 'USD',
      })
    ).toBe(false);
  });
});

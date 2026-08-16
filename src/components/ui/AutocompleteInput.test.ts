import { describe, expect, it } from 'vitest';
import { resolveAutocompleteDropdownLayout } from './AutocompleteInput';

describe('AutocompleteInput dropdown layout', () => {
  it('opens upward when a long list has more room above the input', () => {
    expect(
      resolveAutocompleteDropdownLayout({
        inputTop: 420,
        inputBottom: 468,
        viewportHeight: 640,
        optionCount: 12,
      })
    ).toEqual({ openUpward: true, maxHeight: 320 });
  });

  it('opens downward when there is enough room below the input', () => {
    expect(
      resolveAutocompleteDropdownLayout({
        inputTop: 120,
        inputBottom: 168,
        viewportHeight: 720,
        optionCount: 5,
      })
    ).toEqual({ openUpward: false, maxHeight: 320 });
  });

  it('limits the dropdown height to the available viewport space', () => {
    expect(
      resolveAutocompleteDropdownLayout({
        inputTop: 100,
        inputBottom: 148,
        viewportHeight: 320,
        optionCount: 10,
      })
    ).toEqual({ openUpward: false, maxHeight: 160 });
  });
});

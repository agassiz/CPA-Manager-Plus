import { describe, expect, it } from 'vitest';
import { applyClineMode, CLINE_MODES, DEFAULT_CLINE_MODE, readClineMode } from './clineMode';

describe('Cline credential mode', () => {
  it('treats an absent or unrecognised field as the default usage-billing mode', () => {
    expect(DEFAULT_CLINE_MODE).toBe('billing');
    expect(readClineMode({})).toBe('billing');
    expect(readClineMode({ cline_mode: null })).toBe('billing');
    expect(readClineMode({ cline_mode: 'free' })).toBe('billing');
    expect(readClineMode({ cline_mode: 3 })).toBe('billing');
  });

  it('reads explicit modes, ignoring case and surrounding spaces', () => {
    expect(readClineMode({ cline_mode: 'pass' })).toBe('pass');
    expect(readClineMode({ cline_mode: ' ALL ' })).toBe('all');
  });

  it('stores non-default modes and removes the field for the default one', () => {
    expect(applyClineMode({ type: 'cline' }, 'pass')).toEqual({ type: 'cline', cline_mode: 'pass' });
    expect(applyClineMode({ type: 'cline', cline_mode: 'all' }, 'billing')).toEqual({
      type: 'cline',
    });
  });

  it('does not mutate the input credential', () => {
    const json = { type: 'cline', cline_mode: 'pass' };
    applyClineMode(json, 'billing');
    expect(json).toEqual({ type: 'cline', cline_mode: 'pass' });
  });

  it('offers the three modes in dropdown order', () => {
    expect([...CLINE_MODES]).toEqual(['billing', 'pass', 'all']);
  });
});

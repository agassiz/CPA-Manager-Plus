import { describe, expect, it } from 'vitest';
import { validateDevinCallback } from './devinOAuth';

describe('validateDevinCallback', () => {
  it('accepts a complete callback from the current login attempt', () => {
    expect(
      validateDevinCallback(
        'https://127.0.0.1:9443/devin/callback?code=fixture-code&state=current',
        'current'
      )
    ).toBeUndefined();
    expect(
      validateDevinCallback(
        'http://localhost:8317/devin/callback?error=access_denied&state=current',
        'current'
      )
    ).toBeUndefined();
  });

  it('rejects callbacks from another login attempt', () => {
    expect(
      validateDevinCallback(
        'http://127.0.0.1:8317/devin/callback?code=fixture-code&state=old',
        'current'
      )
    ).toBe('state_mismatch');
  });

  it.each([
    '',
    'fixture-code',
    '/devin/callback?code=fixture-code&state=current',
    'file:///devin/callback?code=fixture-code&state=current',
    'http://127.0.0.1:8317/devin/callback?code=fixture-code',
    'http://127.0.0.1:8317/devin/callback?state=current',
    'http://127.0.0.1:8317/devin/callback?state=current&state=old&code=fixture-code',
  ])('rejects incomplete or unsafe callback %s', (callback) => {
    expect(validateDevinCallback(callback, 'current')).toBe('invalid');
  });
});

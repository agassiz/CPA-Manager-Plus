import { describe, expect, it } from 'vitest';
import { maskEmailLike } from './base';

describe('maskEmailLike', () => {
  it('masks email addresses while retaining their domain', () => {
    expect(maskEmailLike('she@example.com')).toBe('she***@example.com');
  });

  it('masks long opaque account identifiers', () => {
    expect(maskEmailLike('sk-1234567890abcdef')).toBe('sk-1...cdef');
    expect(maskEmailLike('rc-abcdefghijklmnopcdef')).toBe('rc-a...cdef');
  });
});

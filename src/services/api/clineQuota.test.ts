import { describe, expect, it } from 'vitest';
import { formatClineCredits, readClineBalance, readClineUserId } from './clineQuota';

describe('Cline quota responses', () => {
  it('reads the account id from the users/me envelope', () => {
    expect(readClineUserId({ success: true, data: { id: 'usr-1', email: 'a@example.com' } })).toBe(
      'usr-1'
    );
    expect(readClineUserId(JSON.stringify({ success: true, data: { id: ' usr-2 ' } }))).toBe(
      'usr-2'
    );
  });

  it('rejects responses that do not match the envelope contract', () => {
    expect(readClineUserId({ success: false, data: { id: 'usr-1' } })).toBeNull();
    expect(readClineUserId({ success: true, data: {} })).toBeNull();
    expect(readClineUserId({ data: { id: 'usr-1' } })).toBeNull();
    expect(readClineUserId('not json')).toBeNull();
    expect(readClineBalance({ success: true, data: { balance: '49635' } })).toBeNull();
    expect(readClineBalance({ success: true, data: {} })).toBeNull();
    expect(readClineBalance(null)).toBeNull();
  });

  it('reads the balance in millionths of a dollar', () => {
    expect(
      readClineBalance({ success: true, data: { userId: 'usr-1', balance: 49635 } })
    ).toEqual({ balanceMicroUsd: 49635 });
    expect(readClineBalance({ success: true, data: { balance: 0 } })).toEqual({
      balanceMicroUsd: 0,
    });
  });

  it('formats balances with extra precision below one dollar', () => {
    expect(formatClineCredits({ balanceMicroUsd: 49635 })).toBe('$0.0496');
    expect(formatClineCredits({ balanceMicroUsd: 0 })).toBe('$0.0000');
    expect(formatClineCredits({ balanceMicroUsd: 12_345_678 })).toBe('$12.35');
    expect(formatClineCredits(null)).toBe('--');
  });
});

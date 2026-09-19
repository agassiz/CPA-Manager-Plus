import { describe, expect, it } from 'vitest';
import { buildClaudeModelsPayload } from './AiProvidersClaudeEditLayout';

describe('buildClaudeModelsPayload', () => {
  it('keeps thinking level mappings in Claude model payloads', () => {
    expect(
      buildClaudeModelsPayload([
        {
          name: 'claude-sonnet-4-5',
          alias: 'claude-sonnet-4-5',
          thinking: {
            levels: ['low', 'medium', 'high'],
            level_mapping: { max: 'high' },
          },
        },
      ])
    ).toEqual([
      {
        name: 'claude-sonnet-4-5',
        alias: 'claude-sonnet-4-5',
        thinking: {
          levels: ['low', 'medium', 'high'],
          level_mapping: { max: 'high' },
        },
      },
    ]);
  });
});

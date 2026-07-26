import { describe, expect, it } from 'vitest';
import {
  buildCodexResponsesEndpoint,
  hasAmpcodeConfiguration,
} from '@/components/providers/utils';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from './descriptors';

describe('providers workbench catalog', () => {
  it('exposes the built-in and sponsor provider families', () => {
    expect(PROVIDER_BRAND_ORDER).toEqual([
      'openaiCompatibility',
      'claude',
      'codex',
      'gemini',
      'xai',
      'vertex',
      'kimi',
      'apikeyFun',
      'claudeApi',
      'code0',
      'fennoAI',
      'qiniuCloud',
    ]);
    expect(PROVIDER_DESCRIPTORS.codex.supportsTestModel).toBe(true);
    expect(PROVIDER_DESCRIPTORS.codex.baseUrlRequired).toBe(true);
    expect(PROVIDER_DESCRIPTORS.xai.supportsWebsockets).toBe(true);
  });

  it('builds the Codex Responses connectivity endpoint from supported base URL forms', () => {
    expect(buildCodexResponsesEndpoint('https://proxy.example.com/v1')).toBe(
      'https://proxy.example.com/v1/responses'
    );
    expect(buildCodexResponsesEndpoint('https://proxy.example.com/v1/models')).toBe(
      'https://proxy.example.com/v1/responses'
    );
    expect(buildCodexResponsesEndpoint('https://proxy.example.com/v1/responses')).toBe(
      'https://proxy.example.com/v1/responses'
    );
  });

  it('only treats meaningful Ampcode values as configured', () => {
    expect(hasAmpcodeConfiguration(undefined)).toBe(false);
    expect(hasAmpcodeConfiguration({})).toBe(false);
    expect(hasAmpcodeConfiguration({ forceModelMappings: false })).toBe(false);
    expect(hasAmpcodeConfiguration({ upstreamUrl: 'https://amp.example.com' })).toBe(true);
    expect(hasAmpcodeConfiguration({ upstreamApiKeys: [{ upstreamApiKey: 'key', apiKeys: ['a'] }] })).toBe(true);
    expect(hasAmpcodeConfiguration({ modelMappings: [{ from: 'a', to: 'b' }] })).toBe(true);
    expect(hasAmpcodeConfiguration({ forceModelMappings: true })).toBe(true);
  });
});

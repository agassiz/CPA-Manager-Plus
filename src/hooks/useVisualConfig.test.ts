import { act, createElement, createRef, useImperativeHandle, type Ref } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

type UseVisualConfigResult = ReturnType<typeof useVisualConfig>;

type UseVisualConfigHarness = {
  getCurrent: () => UseVisualConfigResult;
  unmount: () => void;
};

function HookHarness({ hookRef }: { hookRef: Ref<UseVisualConfigResult> }) {
  const hook = useVisualConfig();
  useImperativeHandle(hookRef, () => hook, [hook]);
  return null;
}

const mountUseVisualConfig = (): UseVisualConfigHarness => {
  const hookRef = createRef<UseVisualConfigResult>();
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = create(createElement(HookHarness, { hookRef }));
  });

  return {
    getCurrent: () => {
      if (!hookRef.current) {
        throw new Error('Failed to mount useVisualConfig test harness');
      }
      return hookRef.current;
    },
    unmount: () => {
      if (!renderer) return;
      act(() => {
        renderer?.unmount();
      });
    },
  };
};

describe('useVisualConfig', () => {
  it('round-trips the Responses compact fallback model', () => {
    const harness = mountUseVisualConfig();
    const yaml = ['codex:', '  responses-compact-fallback-model: claude-sonnet-4-6', ''].join(
      '\n'
    );

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.responsesCompactFallbackModel).toBe(
      'claude-sonnet-4-6'
    );

    act(() => {
      harness
        .getCurrent()
        .setVisualValues({ responsesCompactFallbackModel: 'claude-opus-4-6' });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('codex:');
    expect(savedYaml).toContain('responses-compact-fallback-model: claude-opus-4-6');

    harness.unmount();
  });

  it('round-trips the global image fallback model', () => {
    const harness = mountUseVisualConfig();
    const yaml = ['image-fallback-model: gpt-5.6-luna', ''].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.imageFallbackModel).toBe('gpt-5.6-luna');

    act(() => {
      harness.getCurrent().setVisualValues({
        imageFallbackModel: 'vision-gpt',
      });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('image-fallback-model: vision-gpt');

    harness.unmount();
  });

  it('defaults configured completion models to disabled', () => {
    const harness = mountUseVisualConfig();
    const yaml = [
      'augment:',
      '  code-completion-model: gpt-5.4-mini',
      '  chat-input-completion-model: claude-haiku-4-5',
      '',
    ].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });

    expect(harness.getCurrent().visualValues.augmentUseConfiguredCompletionModels).toBe(false);
    expect(harness.getCurrent().visualValues.augmentCodeCompletionModel).toBe('gpt-5.4-mini');
    expect(harness.getCurrent().visualValues.augmentChatInputCompletionModel).toBe(
      'claude-haiku-4-5'
    );

    harness.unmount();
  });

  it('round-trips plugin system toggle', () => {
    const harness = mountUseVisualConfig();
    const yaml = ['plugins:', '  enabled: false', '  dir: plugins', ''].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.pluginsEnabled).toBe(false);

    act(() => {
      harness.getCurrent().setVisualValues({ pluginsEnabled: true });
    });
    expect(harness.getCurrent().visualDirty).toBe(true);

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('plugins:');
    expect(savedYaml).toContain('enabled: true');
    expect(savedYaml).toContain('dir: plugins');

    harness.unmount();
  });

  it('clears camelCase codex identityConfuse when disabling from visual editor', () => {
    const harness = mountUseVisualConfig();
    const yaml = [
      'host: 127.0.0.1',
      'codex:',
      '  identityConfuse: true',
      '  other-setting: kept',
      '',
    ].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.codexIdentityConfuse).toBe(true);

    act(() => {
      harness.getCurrent().setVisualValues({ codexIdentityConfuse: false });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).not.toContain('identityConfuse: true');
    expect(savedYaml).not.toContain('identityConfuse:');
    expect(savedYaml).toContain('identity-confuse: false');
    expect(savedYaml).toContain('other-setting: kept');

    harness.unmount();
  });

  it('round-trips codex bug mode from visual editor', () => {
    const harness = mountUseVisualConfig();
    const yaml = ['host: 127.0.0.1', 'codex:', '  force-super-category: true', ''].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.codexBugMode).toBe(false);
    expect(harness.getCurrent().visualValues.codexForceSuperCategory).toBe(true);

    act(() => {
      harness.getCurrent().setVisualValues({ codexBugMode: true });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('codex:');
    expect(savedYaml).toContain('force-super-category: true');
    expect(savedYaml).toContain('bug-mode: true');

    harness.unmount();
  });

  it('round-trips global Claude cache-related toggles', () => {
    const harness = mountUseVisualConfig();
    const yaml = [
      'host: 127.0.0.1',
      'disable-claude-cloak-mode: false',
      'experimental-cch-signing: false',
      '',
    ].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });
    expect(harness.getCurrent().visualValues.disableClaudeCloakMode).toBe(false);
    expect(harness.getCurrent().visualValues.experimentalCCHSigning).toBe(false);

    act(() => {
      harness.getCurrent().setVisualValues({
        disableClaudeCloakMode: true,
        experimentalCCHSigning: true,
      });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('disable-claude-cloak-mode: true');
    expect(savedYaml).toContain('experimental-cch-signing: true');

    harness.unmount();
  });

  it('round-trips augment and kiro request policy fields', () => {
    const harness = mountUseVisualConfig();
    const yaml = [
      'augment:',
      '  silent-mode-model: gpt-5.5',
      '  image-fallback-model: qwen3.5-plus',
      '  codebase-retrieval-model: claude-sonnet-4-5',
      '  use-configured-completion-models: true',
      '  code-completion-model: gpt-5.4-mini',
      '  chat-input-completion-model: claude-haiku-4-5',
      'kiro-request-policy:',
      '  per-account-rpm-limit: 20',
      '  rpm-limits:',
      '    free: 12',
      '    pro: 60',
      '  cooldown-strategy: linear',
      '  base-cooldown-seconds: 300',
      '  max-cooldown-seconds: 1800',
      '  consecutive-error-cooldown-threshold: 5',
      '  consecutive-error-disable-threshold: 20',
      '  invalid-auth-auto-disable: true',
      '',
    ].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });

    expect(harness.getCurrent().visualValues.augmentSilentModeModel).toBe('gpt-5.5');
    expect(harness.getCurrent().visualValues.augmentCodebaseRetrievalModel).toBe(
      'claude-sonnet-4-5'
    );
    expect(harness.getCurrent().visualValues.augmentUseConfiguredCompletionModels).toBe(true);
    expect(harness.getCurrent().visualValues.augmentCodeCompletionModel).toBe('gpt-5.4-mini');
    expect(harness.getCurrent().visualValues.augmentChatInputCompletionModel).toBe(
      'claude-haiku-4-5'
    );
    expect(harness.getCurrent().visualValues.kiroProRpmLimit).toBe('60');

    act(() => {
      harness.getCurrent().setVisualValues({
        augmentCodebaseRetrievalModel: 'gpt-5.5',
        augmentUseConfiguredCompletionModels: false,
        augmentCodeCompletionModel: 'gpt-5.6-luna',
        augmentChatInputCompletionModel: 'gpt-5.4-mini',
        augmentShowThinkingProgress: true,
        kiroCooldownStrategy: 'exponential',
      });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('codebase-retrieval-model: gpt-5.5');
    expect(savedYaml).toContain('use-configured-completion-models: false');
    expect(savedYaml).toContain('code-completion-model: gpt-5.6-luna');
    expect(savedYaml).toContain('chat-input-completion-model: gpt-5.4-mini');
    expect(savedYaml).toContain('show-thinking-progress: true');
    expect(savedYaml).not.toContain('image-fallback-model: qwen3.5-plus');
    expect(savedYaml).toContain('cooldown-strategy: exponential');

    harness.unmount();
  });

  it('round-trips usage models with ordering metadata', () => {
    const harness = mountUseVisualConfig();
    const yaml = [
      'usage-models:',
      '  gpt-5.5:',
      '    displayName: GPT-5.5',
      '    shortName: gpt5.5',
      '    description: 修复 Bug 的主力',
      '    disabled: false',
      '    isNew: true',
      '    isDefault: true',
      '    modelGroupPriority: 0',
      '    priority: 1',
      '  old-model:',
      '    displayName: Old Model',
      '    disabled: false',
      '    isLegacyModel: true',
      '    modelGroupPriority: 1',
      '    priority: 1',
      '',
    ].join('\n');

    act(() => {
      const result = harness.getCurrent().loadVisualValuesFromYaml(yaml);
      expect(result.ok).toBe(true);
    });

    expect(harness.getCurrent().visualValues.usageModels).toHaveLength(2);
    expect(harness.getCurrent().visualValues.usageModels[0].name).toBe('gpt-5.5');

    act(() => {
      harness.getCurrent().setVisualValues({
        usageModels: harness
          .getCurrent()
          .visualValues.usageModels.map((model) =>
            model.name === 'old-model'
              ? { ...model, modelGroupPriority: 0, priority: 2, isDefault: false }
              : model
          ),
      });
    });

    const savedYaml = harness.getCurrent().applyVisualChangesToYaml(yaml);
    expect(savedYaml).toContain('usage-models:');
    expect(savedYaml).toContain('displayName: GPT-5.5');
    expect(savedYaml).toContain('modelGroupPriority: 0');
    expect(savedYaml).toContain('priority: 2');

    harness.unmount();
  });
});

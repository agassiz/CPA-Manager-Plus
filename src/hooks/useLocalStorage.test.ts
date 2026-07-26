import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocalStorage } from './useLocalStorage';

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLocalStorage', () => {
  it('restores a persisted value after remounting', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });

    let renderer: ReactTestRenderer | null = null;

    function Consumer() {
      const [value, updateValue] = useLocalStorage('ai-providers-list-mode', false);
      return createElement('button', {
        type: 'button',
        'data-value': String(value),
        onClick: () => updateValue(true),
      });
    }

    const readValue = () => renderer!.root.findByType('button').props['data-value'];

    act(() => {
      renderer = create(createElement(Consumer));
    });

    expect(readValue()).toBe('false');
    expect(storage.getItem('ai-providers-list-mode')).toBeNull();

    act(() => {
      renderer!.root.findByType('button').props.onClick();
    });

    expect(readValue()).toBe('true');
    expect(storage.getItem('ai-providers-list-mode')).toBe('true');

    act(() => {
      renderer!.unmount();
      renderer = create(createElement(Consumer));
    });

    expect(readValue()).toBe('true');
    renderer!.unmount();
  });
});

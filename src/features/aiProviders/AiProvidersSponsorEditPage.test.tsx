import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AiProvidersSponsorEditPage } from './AiProvidersSponsorEditPage';

vi.mock('@/features/providers/useProviderWorkbench', () => ({
  useProviderWorkbench: () => ({
    isPending: false,
    snapshot: { groups: [] },
    createProvider: vi.fn(),
    updateProvider: vi.fn(),
  }),
}));

// useBlocker needs a data router, which static rendering does not provide.
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation: vi.fn() }),
}));

describe('AiProvidersSponsorEditPage', () => {
  it('renders the full-page editor for a new sponsor provider', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AiProvidersSponsorEditPage brand="kimi" />
      </MemoryRouter>
    );
    // Test i18n resolves to the English copy.
    expect(html).toContain('Grouped key #1');
    expect(html).toContain('Group/protocol');
    expect(html).toContain('Not configured');
  });
});

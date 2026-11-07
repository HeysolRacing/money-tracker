import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../src/components/Layout';
import { DesignProvider } from '../src/theme/DesignProvider';

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <DesignProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      </QueryClientProvider>
    </DesignProvider>,
  );
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // storage unavailable: the sidebar just starts expanded
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('Layout sidebar', () => {
  it('collapses to icons and expands back, remembering the choice', () => {
    renderLayout();
    expect(screen.getByText('Inversiones')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }));
    expect(screen.queryByText('Inversiones')).not.toBeInTheDocument();
    // Links stay reachable by name while collapsed.
    expect(screen.getByRole('link', { name: 'Inversiones' })).toBeInTheDocument();
    expect(localStorage.getItem('mt-navbar-collapsed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }));
    expect(screen.getByText('Inversiones')).toBeInTheDocument();
  });
});

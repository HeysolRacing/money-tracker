import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DESIGNS, findDesign } from '../src/theme/designs';
import { DesignPicker } from '../src/theme/DesignPicker';
import { DesignProvider } from '../src/theme/DesignProvider';

beforeEach(() => localStorage.clear());

describe('designs', () => {
  it('offers at least 3 designs with unique ids', () => {
    expect(DESIGNS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(DESIGNS.length);
  });

  it('falls back to the default design for unknown ids', () => {
    expect(findDesign('nope').id).toBe('clasico');
    expect(findDesign(null).id).toBe('clasico');
  });

  it('switches design from the header picker and remembers it', async () => {
    render(
      <DesignProvider>
        <DesignPicker />
      </DesignProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar diseño' }));
    fireEvent.click(await screen.findByText('Medianoche'));

    expect(await screen.findByRole('button', { name: 'Cambiar diseño' })).toHaveTextContent(
      'Medianoche',
    );
    expect(localStorage.getItem('mt-design')).toBe('medianoche');
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark');
  });

  it('restores the saved design on load', () => {
    localStorage.setItem('mt-design', 'terracota');
    render(
      <DesignProvider>
        <DesignPicker />
      </DesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Cambiar diseño' })).toHaveTextContent('Terracota');
  });
});

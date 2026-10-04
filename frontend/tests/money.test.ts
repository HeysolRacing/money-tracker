import { describe, expect, it } from 'vitest';
import { formatMoney } from '../src/lib/money';

describe('formatMoney', () => {
  it('formats MXN in es-MX', () => {
    expect(formatMoney('1234.5')).toBe('$1,234.50');
  });

  it('formats USD with its code', () => {
    // Intl separates the code with a non-breaking space.
    expect(formatMoney('10', 'USD')).toMatch(/^USD\s10\.00$/);
  });
});

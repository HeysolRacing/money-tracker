import { describe, expect, it } from 'vitest';
import { formatDayMonth } from '../src/lib/dates';
import { ivaOf } from '../src/lib/money';

describe('invoice helpers', () => {
  it('formats Fecha Aplicación as DD-MMM', () => {
    expect(formatDayMonth('2026-08-22')).toBe('22-Aug');
    expect(formatDayMonth('2026-01-05')).toBe('05-Jan');
  });

  it('computes 16% IVA rounded to cents', () => {
    expect(ivaOf('10000')).toBe('1600.00');
    expect(ivaOf('1234.56')).toBe('197.53');
    expect(ivaOf(0)).toBe('0.00');
  });
});

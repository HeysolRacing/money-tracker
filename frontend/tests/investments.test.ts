import { describe, expect, it } from 'vitest';
import {
  formatPercent,
  percentChange,
  periodLabel,
  termEndDate,
  termPreview,
} from '../src/features/investments/interest';

describe('termPreview', () => {
  it('uses an annual rate over a 360-day year, like the backend', () => {
    expect(termPreview('100000', '10', 90)).toEqual({
      interest: '2500.00',
      net: '2500.00',
      final: '102500.00',
    });
    // 2946.875 rounds half up.
    expect(termPreview('102500', '11.5', 90).interest).toBe('2946.88');
  });

  it('deducts ISR from the net and the final amount', () => {
    expect(termPreview('100000', '10', 90, '100')).toEqual({
      interest: '2500.00',
      net: '2400.00',
      final: '102400.00',
    });
  });
});

describe('dates and percentages', () => {
  it('computes the end date and the period label', () => {
    expect(termEndDate('2026-01-01', 90)).toBe('2026-04-01');
    expect(periodLabel('2026-01-01', '2026-04-01')).toMatch(/^ene.* – abr.* 2026$/);
    expect(periodLabel('2025-11-15', '2026-02-13')).toMatch(/2025 – feb.* 2026$/);
  });

  it('computes percent change, or null without a base', () => {
    expect(percentChange('500.00', '1000.00')).toBe(0.5);
    expect(percentChange('500.00', '0.00')).toBeNull();
    expect(percentChange(null, '1000.00')).toBeNull();
    expect(formatPercent(0.5)).toMatch(/^\+50\s?%$/);
  });
});

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { nextDayOfMonth } from '../src/lib/dates';
import { addMoney } from '../src/lib/money';

describe('nextDayOfMonth', () => {
  const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

  it('returns this month when the day is still ahead', () => {
    expect(fmt(nextDayOfMonth(20, dayjs('2026-10-04')))).toBe('2026-10-20');
  });

  it('includes today', () => {
    expect(fmt(nextDayOfMonth(4, dayjs('2026-10-04')))).toBe('2026-10-04');
  });

  it('rolls over to next month when the day has passed', () => {
    expect(fmt(nextDayOfMonth(3, dayjs('2026-10-04')))).toBe('2026-11-03');
  });

  it('clamps to the last day of short months', () => {
    expect(fmt(nextDayOfMonth(31, dayjs('2027-02-10')))).toBe('2027-02-28');
    expect(fmt(nextDayOfMonth(31, dayjs('2026-11-05')))).toBe('2026-11-30');
  });
});

describe('addMoney', () => {
  it('adds decimal strings without float drift', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('20000.00', '-1234.56')).toBe('18765.44');
  });
});

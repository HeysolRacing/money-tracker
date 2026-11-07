import dayjs from 'dayjs';
import 'dayjs/locale/es-mx';
import { fromCents, toCents } from '../../lib/money';

/** Mexican banks and Sofipos quote annual rates over a 360-day year (same as the backend). */
export const DAY_BASIS = 360;

export const TERM_PRESETS = [30, 60, 90] as const;

/**
 * Preview of a term's figures while typing; the backend's numbers are authoritative.
 * Interest = amount × rate% × days / 360, rounded half up to cents.
 */
export function termPreview(
  amount: string | number,
  annualRate: string | number,
  days: number,
  isrWithheld: string | number = 0,
) {
  const interestCents = Math.round(
    (toCents(amount) * Number(annualRate) * days) / (100 * DAY_BASIS),
  );
  const netCents = interestCents - toCents(isrWithheld);
  return {
    interest: fromCents(interestCents),
    net: fromCents(netCents),
    final: fromCents(toCents(amount) + netCents),
  };
}

export function termEndDate(start: string, days: number): string {
  return dayjs(start).add(days, 'day').format('YYYY-MM-DD');
}

/** Spanish month abbreviations used as grid headers, January first. */
export const MONTHS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

/** "ene – mar 2026", or "nov 2025 – feb 2026" across years. */
export function periodLabel(start: string, end: string): string {
  const s = dayjs(start).locale('es-mx');
  const e = dayjs(end).locale('es-mx');
  return s.year() === e.year()
    ? `${s.format('MMM')} – ${e.format('MMM YYYY')}`
    : `${s.format('MMM YYYY')} – ${e.format('MMM YYYY')}`;
}

/** Percent change from `base` to `base + change`, or null when it can't be computed. */
export function percentChange(change?: string | null, base?: string | null): number | null {
  if (change == null || base == null || toCents(base) === 0) return null;
  return toCents(change) / toCents(base);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(value);
}

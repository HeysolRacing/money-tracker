import dayjs, { type Dayjs } from 'dayjs';

/**
 * Next occurrence (today or later) of a day of the month, clamped to the month's length:
 * day 31 in February is the 28th/29th. Used for credit card statement and due dates.
 */
export function nextDayOfMonth(day: number, from: Dayjs = dayjs()): Dayjs {
  const today = from.startOf('day');
  const inMonth = (month: Dayjs) => month.date(Math.min(day, month.daysInMonth()));
  const candidate = inMonth(today.startOf('month'));
  return candidate.isBefore(today) ? inMonth(today.add(1, 'month').startOf('month')) : candidate;
}

export function formatDate(value: string | Dayjs): string {
  return dayjs(value).format('DD/MM/YYYY');
}

export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** Short day-month format used in the invoices table, e.g. "22-Aug". */
export function formatDayMonth(value: string | Dayjs): string {
  return dayjs(value).locale('en').format('DD-MMM');
}

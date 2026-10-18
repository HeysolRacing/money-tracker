import { fromCents, toCents } from '../../lib/money';

/**
 * Running balance after each entry (Préstamo adds, Pagado subtracts), as decimal strings.
 * Entries must be in ledger order (oldest first), as the API returns them.
 * A negative balance means the borrower has paid back more than they were lent.
 */
export function runningBalances(entries: { lent: string; paid: string }[]): string[] {
  let cents = 0;
  return entries.map((e) => {
    cents += toCents(e.lent) - toCents(e.paid);
    return fromCents(cents);
  });
}

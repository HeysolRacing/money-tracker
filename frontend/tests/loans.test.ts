import { describe, expect, it } from 'vitest';
import { runningBalances } from '../src/features/loans/ledger';

describe('loan ledger', () => {
  it('adds Préstamo and subtracts Pagado row by row', () => {
    const rows = [
      { lent: '10999.00', paid: '0.00' },
      { lent: '0.00', paid: '914.00' },
      { lent: '5100.00', paid: '0.00' },
      { lent: '0.00', paid: '1700.00' },
    ];
    expect(runningBalances(rows)).toEqual(['10999.00', '10085.00', '15185.00', '13485.00']);
  });

  it('goes negative when more is paid back than lent', () => {
    expect(
      runningBalances([
        { lent: '100.10', paid: '0' },
        { lent: '0', paid: '150.20' },
      ]),
    ).toEqual(['100.10', '-50.10']);
  });
});

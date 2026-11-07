/**
 * Smoke tests: each page renders with realistic API data (fetch is stubbed) without crashing.
 */
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsPage } from '../src/pages/AccountsPage';
import { CategoriesPage } from '../src/pages/CategoriesPage';
import { HomePage } from '../src/pages/HomePage';
import { InvestmentsPage } from '../src/pages/InvestmentsPage';
import { InvoicesPage } from '../src/pages/InvoicesPage';
import { LoansPage } from '../src/pages/LoansPage';
import { TransactionsPage } from '../src/pages/TransactionsPage';

const accounts = [
  {
    id: 1,
    name: 'BBVA Nómina',
    bank: 'BBVA',
    type: 'debit',
    currency: 'MXN',
    opening_balance: '1000.00',
    is_archived: false,
    credit_limit: null,
    statement_day: null,
    payment_due_day: null,
    balance: '4000.00',
  },
  {
    id: 2,
    name: 'Liverpool',
    bank: 'Liverpool',
    type: 'credit_card',
    currency: 'MXN',
    opening_balance: '0.00',
    is_archived: false,
    credit_limit: '20000.00',
    statement_day: 10,
    payment_due_day: 30,
    balance: '-1234.56',
  },
];

const categories = [
  { id: 1, name: 'Alimentación', kind: 'expense', parent_id: null, color: null },
  { id: 2, name: 'Supermercado', kind: 'expense', parent_id: 1, color: null },
  { id: 3, name: 'Salario', kind: 'income', parent_id: null, color: null },
];

const transactions = {
  total: 2,
  items: [
    {
      id: 10,
      account_id: 2,
      date: '2026-10-01',
      kind: 'expense',
      amount: '1234.56',
      description: 'Despensa',
      merchant: 'WALMART',
      category_id: 2,
      notes: null,
      transfer_peer_id: null,
      counterpart_account_id: null,
    },
    {
      id: 11,
      account_id: 1,
      date: '2026-10-02',
      kind: 'transfer_out',
      amount: '500.00',
      description: 'Pago Liverpool',
      merchant: null,
      category_id: null,
      notes: null,
      transfer_peer_id: 12,
      counterpart_account_id: 2,
    },
  ],
};

const amounts = (count: number, subtotal: string, iva: string, total: string) => ({
  count,
  subtotal,
  iva,
  total,
});

const invoices = {
  items: [
    {
      id: 1,
      application_date: '2026-08-22',
      concept: 'Consultoría agosto',
      subtotal: '10000.00',
      iva: '1600.00',
      total: '11600.00',
      is_invoiced: true,
      is_extra: false,
    },
    {
      id: 2,
      application_date: '2026-09-05',
      concept: 'Soporte extra',
      subtotal: '500.00',
      iva: '80.00',
      total: '580.00',
      is_invoiced: false,
      is_extra: true,
    },
  ],
  summary: {
    all: amounts(2, '10500.00', '1680.00', '12180.00'),
    invoiced: amounts(1, '10000.00', '1600.00', '11600.00'),
    pending: amounts(1, '500.00', '80.00', '580.00'),
    extra: amounts(1, '500.00', '80.00', '580.00'),
  },
};

const loanTotals = (lent: string, paid: string, balance: string, revenue: string) => ({
  count: 2,
  lent,
  paid,
  balance,
  revenue,
});

const borrowers = [
  { id: 1, name: 'Aromas', totals: loanTotals('500.00', '650.00', '0.00', '150.00') },
  { id: 2, name: 'Ricardo', totals: loanTotals('10999.00', '914.00', '10085.00', '0.00') },
];

const loans = {
  items: [
    {
      id: 1,
      borrower_id: 2,
      entry_date: '2026-04-14',
      description: 'OSVALDO',
      lent: '10999.00',
      paid: '0.00',
    },
    {
      id: 2,
      borrower_id: 2,
      entry_date: '2026-06-01',
      description: 'PAGO 1',
      lent: '0.00',
      paid: '914.00',
    },
  ],
  summary: loanTotals('10999.00', '914.00', '10085.00', '0.00'),
};

const withMonths = (values: (string | null)[]) =>
  [...values, ...Array<string | null>(12).fill(null)].slice(0, 12);

const investmentGrid = {
  year: 2026,
  years: [2026],
  items: [
    {
      id: 1,
      name: 'OPENBANK',
      group: 'main',
      months: withMonths(['871865.92', '848646.32', '0.00']),
      term_count: 2,
      active_terms: 1,
    },
    {
      id: 2,
      name: 'MIFEL',
      group: 'main',
      months: withMonths([null, '429762.73']),
      term_count: 0,
      active_terms: 0,
    },
    {
      id: 3,
      name: 'INFONAVIT',
      group: 'occasional',
      months: withMonths(['10000.00']),
      term_count: 0,
      active_terms: 0,
    },
  ],
  totals: {
    main: withMonths(['871865.92', '1278409.05', '0.00']),
    occasional: withMonths(['10000.00']),
    overall: withMonths(['881865.92', '1278409.05', '0.00']),
  },
  summary: {
    as_of_month: 2,
    current_total: '1278409.05',
    previous_total: '881865.92',
    monthly_change: '396543.13',
    first_total: '881865.92',
    year_change: '396543.13',
    interest_earned: '2400.00',
    active_principal: '102400.00',
    expected_interest: '2944.00',
    active_terms: 1,
  },
};

const term = (
  id: number,
  start: string,
  end: string,
  amount: string,
  rate: string,
  interest: string,
  status: string,
) => ({
  id,
  investment_id: 1,
  start_date: start,
  end_date: end,
  days: 90,
  amount,
  annual_rate: rate,
  isr_withheld: '0.00',
  notes: null,
  interest,
  net_interest: interest,
  final_amount: (Number(amount) + Number(interest)).toFixed(2),
  status,
});

const investmentTerms = {
  items: [
    term(1, '2026-01-01', '2026-04-01', '100000.00', '10', '2500.00', 'matured'),
    term(2, '2026-04-01', '2026-06-30', '102500.00', '11.5', '2946.88', 'active'),
  ],
  totals: {
    count: 2,
    active: 1,
    running: 1,
    invested: '102500.00',
    invested_at_maturity: '105446.88',
    net_interest: '2500.00',
    expected_interest: '2946.88',
  },
};

const investmentDashboard = {
  history: [
    { year: 2026, month: 1, main: '871865.92', occasional: '10000.00', total: '881865.92' },
    { year: 2026, month: 2, main: '1278409.05', occasional: '0.00', total: '1278409.05' },
  ],
  forecast: [{ year: 2026, month: 3, total: '1674952.18' }],
  trend: { months_used: 2, monthly_growth: '396543.13', projected_year_end: '5244840.35' },
  maturities: [
    {
      term_id: 2,
      investment_id: 1,
      investment_name: 'OPENBANK',
      end_date: '2026-06-30',
      days_left: 20,
      amount: '102500.00',
      annual_rate: '11.5',
      net_interest: '2946.88',
      final_amount: '105446.88',
    },
  ],
  terms_projection: { horizon: '2027-01-01', principal: '102500.00', projected_value: '114000.00' },
  growth: [
    {
      id: 1,
      name: 'OPENBANK',
      group: 'main',
      first: '871865.92',
      latest: '848646.32',
      change: '-23219.60',
    },
  ],
};

function respond(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/accounts')) return respond(accounts);
      if (url.includes('/api/categories')) return respond(categories);
      if (url.includes('/api/transactions')) return respond(transactions);
      if (url.includes('/api/invoices')) return respond(invoices);
      if (url.includes('/api/loans/borrowers')) return respond(borrowers);
      if (url.includes('/api/loans')) return respond(loans);
      if (url.includes('/api/investments/dashboard')) return respond(investmentDashboard);
      if (url.includes('/terms')) return respond(investmentTerms);
      if (url.includes('/api/investments')) return respond(investmentGrid);
      return respond({});
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderPage(page: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'es-mx' }}>
        <QueryClientProvider client={client}>
          <ModalsProvider>
            <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>,
  );
}

describe('pages render with data', () => {
  it('HomePage shows balances', async () => {
    renderPage(<HomePage />);
    expect(await screen.findByText('BBVA Nómina')).toBeInTheDocument();
  });

  it('AccountsPage shows card debt and available credit', async () => {
    renderPage(<AccountsPage />);
    expect(await screen.findByText('Liverpool', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Deuda')).toBeInTheDocument();
    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    expect(screen.getByText('$18,765.44')).toBeInTheDocument(); // 20,000 - 1,234.56
  });

  it('AccountsPage opens the account form', async () => {
    renderPage(<AccountsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
  });

  it('CategoriesPage shows the category tree', async () => {
    renderPage(<CategoriesPage />);
    expect(await screen.findByText('Supermercado')).toBeInTheDocument();
    expect(screen.getByText('Salario')).toBeInTheDocument();
  });

  it('TransactionsPage lists transactions and transfers', async () => {
    renderPage(<TransactionsPage />, '/movimientos?account_id=1');
    expect(await screen.findByText('Despensa')).toBeInTheDocument();
    expect(await screen.findByText('Alimentación › Supermercado')).toBeInTheDocument();
    expect(screen.getByText('2 movimientos')).toBeInTheDocument();
  });

  it('TransactionsPage opens the transaction and transfer forms', async () => {
    renderPage(<TransactionsPage />, '/movimientos');
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo movimiento' }));
    expect(await screen.findByLabelText('Monto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }));
    expect(await screen.findByText('Transferencia / pago de tarjeta')).toBeInTheDocument();
  });

  it('InvoicesPage shows rows with DD-MMM dates and the summary header', async () => {
    renderPage(<InvoicesPage />, '/facturas');
    expect(await screen.findByText('Consultoría agosto')).toBeInTheDocument();
    expect(screen.getByText('22-Aug')).toBeInTheDocument();
    expect(screen.getByText('Por facturar')).toBeInTheDocument();
    // Overall total appears in the header card and the table footer.
    expect(screen.getAllByText('$12,180.00').length).toBeGreaterThanOrEqual(2);
  });

  it('InvoicesPage form auto-fills 16% IVA and shows the total', async () => {
    renderPage(<InvoicesPage />, '/facturas');
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva factura' }));
    fireEvent.change(await screen.findByLabelText('Subtotal'), { target: { value: '1000' } });
    expect(await screen.findByDisplayValue('$160.00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$1,160.00')).toBeInTheDocument();
  });

  it('LoansPage shows borrower tabs, ledger rows and the summary header', async () => {
    renderPage(<LoansPage />, '/prestamos');
    expect(await screen.findByText('OSVALDO')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ricardo' })).toBeInTheDocument();
    expect(screen.getByText('14-Apr')).toBeInTheDocument();
    expect(screen.getByText('Saldo pendiente')).toBeInTheDocument();
    // "Todos" shows the Deudor column; a borrower tab shows the running Saldo instead.
    expect(screen.getAllByText('Ricardo').length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole('tab', { name: 'Ricardo' }));
    expect(await screen.findByRole('columnheader', { name: 'Saldo' })).toBeInTheDocument();
  });

  it('LoansPage sorts rows by a clicked column', async () => {
    renderPage(<LoansPage />, '/prestamos');
    await screen.findByText('OSVALDO');
    const descriptions = () =>
      screen.getAllByRole('row').flatMap((row) => {
        const cell = row.querySelectorAll('td')[2];
        return cell ? [cell.textContent] : [];
      });
    expect(descriptions()).toEqual(['OSVALDO', 'PAGO 1', expect.anything()]);
    const header = screen.getByRole('columnheader', { name: /Descripción/ });
    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(descriptions().slice(0, 2)).toEqual(['PAGO 1', 'OSVALDO']);
  });

  it('LoansPage opens the entry form', async () => {
    renderPage(<LoansPage />, '/prestamos');
    await screen.findByText('OSVALDO');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo movimiento' }));
    expect(await screen.findByLabelText('Préstamo')).toBeInTheDocument();
    expect(screen.getByLabelText('Pagado')).toBeInTheDocument();
  });
  it('InvestmentsPage shows the grid like the spreadsheet', async () => {
    renderPage(<InvestmentsPage />, '/inversiones');
    expect(await screen.findByText('OPENBANK')).toBeInTheDocument();
    expect(screen.getByText('Inversiones ocasionales')).toBeInTheDocument();
    expect(screen.getByText('Resumen')).toBeInTheDocument();
    expect(screen.getByText('Total (FEB)')).toBeInTheDocument();
    // An explicit zero shows as "$0.00" (a blank cell stays empty).
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('$ -')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /ENE/ })).toBeInTheDocument();
  });

  it('InvestmentsPage edits a month in place', async () => {
    renderPage(<InvestmentsPage />, '/inversiones');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar MIFEL, ENE' }));
    expect(await screen.findByLabelText('MIFEL, ENE')).toBeInTheDocument();
  });

  it('InvestmentsPage opens the details of an investment', async () => {
    renderPage(<InvestmentsPage />, '/inversiones');
    await screen.findByText('OPENBANK');
    const row = screen.getByText('OPENBANK').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Detalles/ }));
    expect(await screen.findByText('Plazos · OPENBANK')).toBeInTheDocument();
    expect(await screen.findByText('11.5%')).toBeInTheDocument();
    expect(screen.getByText('Monto invertido')).toBeInTheDocument();
    expect(screen.getByText('$102,500.00', { selector: 'p' })).toBeInTheDocument();
    // Each term can be renewed; renew the active one.
    const active = screen.getByText('11.5%').closest('tr')!;
    fireEvent.click(within(active).getByRole('button', { name: 'Renovar' }));
    // A renewal starts with the previous amount plus interest.
    expect(await screen.findByDisplayValue('$105,446.88')).toBeInTheDocument();
  });

  it('InvestmentsPage shows the dashboard', async () => {
    renderPage(<InvestmentsPage />, '/inversiones?vista=dashboard');
    expect(await screen.findByText('Crecimiento y pronóstico')).toBeInTheDocument();
    expect(screen.getByText('Próximos vencimientos')).toBeInTheDocument();
    expect(screen.getByText('Proyección a diciembre')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Ver datos'));
    expect(await screen.findByText('$1,674,952.18')).toBeInTheDocument();
  });
});

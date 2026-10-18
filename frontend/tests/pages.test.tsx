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
});

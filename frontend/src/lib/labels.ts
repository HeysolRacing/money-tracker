import type { Schemas } from '../api/client';

export const ACCOUNT_TYPE_LABELS: Record<Schemas['AccountType'], string> = {
  debit: 'Débito',
  credit_card: 'Tarjeta de crédito',
  cash: 'Efectivo',
  savings: 'Ahorro',
  investment: 'Inversión',
};

export const KIND_LABELS: Record<Schemas['TransactionKind'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer_out: 'Transferencia (salida)',
  transfer_in: 'Transferencia (entrada)',
};

export const BANKS = ['BBVA', 'Inbursa', 'Liverpool', 'Falabella', 'Efectivo', 'Otro'];

export const CURRENCIES = ['MXN', 'USD'] as const;

export function toSelectData<T extends string>(labels: Record<T, string>) {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

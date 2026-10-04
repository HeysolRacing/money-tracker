/**
 * Money arrives from the API as decimal strings (e.g. "1234.50") to avoid float errors.
 * Arithmetic goes through integer cents; format only at the edge.
 */
export function formatMoney(amount: string | number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(amount));
}

export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function addMoney(...amounts: (string | number)[]): string {
  return fromCents(amounts.reduce<number>((sum, a) => sum + toCents(a), 0));
}

export const IVA_RATE = 0.16;

/** 16% IVA of a subtotal, rounded to cents, as a decimal string. */
export function ivaOf(subtotal: string | number): string {
  return fromCents(Math.round(toCents(subtotal) * IVA_RATE));
}

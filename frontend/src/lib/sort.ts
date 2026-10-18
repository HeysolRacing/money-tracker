export type SortOrder = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  order: SortOrder;
}

/** Clicking the sorted column flips its order; clicking another column sorts it ascending. */
export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key === key) return { key, order: current.order === 'asc' ? 'desc' : 'asc' };
  return { key, order: 'asc' };
}

export type SortValue = string | number | boolean | null | undefined;

const collator = new Intl.Collator('es-MX', { sensitivity: 'base', numeric: true });

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  return Number(a) - Number(b);
}

/**
 * Returns a sorted copy. Empty values (null, undefined, '') always go last. The sort is
 * stable, so rows that tie keep the order the API returned them in.
 * Money strings should be mapped to numbers (e.g. with `toCents`) by `value`.
 */
export function sortItems<T, K extends string>(
  items: readonly T[],
  sort: SortState<K>,
  value: (item: T, key: K) => SortValue,
): T[] {
  const sign = sort.order === 'asc' ? 1 : -1;
  const isEmpty = (v: SortValue) => v === null || v === undefined || v === '';
  return [...items].sort((x, y) => {
    const a = value(x, sort.key);
    const b = value(y, sort.key);
    if (isEmpty(a) || isEmpty(b)) return Number(isEmpty(a)) - Number(isEmpty(b));
    return sign * compare(a, b);
  });
}

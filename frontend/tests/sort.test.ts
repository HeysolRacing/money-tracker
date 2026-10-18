import { describe, expect, it } from 'vitest';
import { sortItems, toggleSort } from '../src/lib/sort';

const rows = [
  { id: 1, name: 'Ñandú', amount: 300, date: '2026-05-01' },
  { id: 2, name: 'árbol', amount: 100, date: null },
  { id: 3, name: 'Banco', amount: 100, date: '2026-01-01' },
];

const value = (r: (typeof rows)[number], key: 'name' | 'amount' | 'date') => r[key];
const ids = (sorted: typeof rows) => sorted.map((r) => r.id);

describe('sortItems', () => {
  it('sorts text with Spanish collation, ignoring case and accents', () => {
    expect(ids(sortItems(rows, { key: 'name', order: 'asc' }, value))).toEqual([2, 3, 1]);
    expect(ids(sortItems(rows, { key: 'name', order: 'desc' }, value))).toEqual([1, 3, 2]);
  });

  it('keeps the original order for ties', () => {
    expect(ids(sortItems(rows, { key: 'amount', order: 'asc' }, value))).toEqual([2, 3, 1]);
    expect(ids(sortItems(rows, { key: 'amount', order: 'desc' }, value))).toEqual([1, 2, 3]);
  });

  it('puts empty values last in both directions', () => {
    expect(ids(sortItems(rows, { key: 'date', order: 'asc' }, value))).toEqual([3, 1, 2]);
    expect(ids(sortItems(rows, { key: 'date', order: 'desc' }, value))).toEqual([1, 3, 2]);
  });

  it('does not mutate the input', () => {
    sortItems(rows, { key: 'name', order: 'asc' }, value);
    expect(ids(rows)).toEqual([1, 2, 3]);
  });
});

describe('toggleSort', () => {
  it('flips the same column and starts a new one ascending', () => {
    expect(toggleSort({ key: 'a', order: 'asc' }, 'a')).toEqual({ key: 'a', order: 'desc' });
    expect(toggleSort({ key: 'a', order: 'desc' }, 'a')).toEqual({ key: 'a', order: 'asc' });
    expect(toggleSort<'a' | 'b'>({ key: 'a', order: 'desc' }, 'b')).toEqual({
      key: 'b',
      order: 'asc',
    });
  });
});

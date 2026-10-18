import { Table, UnstyledButton, type TableThProps } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { SortState } from '../lib/sort';

interface Props<K extends string> extends Omit<TableThProps, 'children'> {
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  children: ReactNode;
}

/** A table header that sorts by its column when clicked. */
export function SortableTh<K extends string>({
  sortKey,
  sort,
  onSort,
  children,
  ...props
}: Props<K>) {
  const active = sort.key === sortKey;
  const Icon = !active ? IconSelector : sort.order === 'asc' ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th
      aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...props}
    >
      <UnstyledButton
        onClick={() => onSort(sortKey)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          font: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
        <Icon size={14} style={{ opacity: active ? 1 : 0.4 }} />
      </UnstyledButton>
    </Table.Th>
  );
}

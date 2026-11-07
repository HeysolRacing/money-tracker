import { ActionIcon, Badge, Button, Group, Table, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconListDetails, IconPencil, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type CSSProperties } from 'react';
import type { Schemas } from '../../api/client';
import { SortableTh } from '../../components/SortableTh';
import { formatMoney, toCents } from '../../lib/money';
import { sortItems, toggleSort, type SortState } from '../../lib/sort';
import { useDeleteInvestment } from './api';
import { BalanceCell } from './BalanceCell';
import { MONTHS } from './interest';

type Grid = Schemas['InvestmentGrid'];
type Row = Schemas['InvestmentRow'];
type MonthKey = `m${number}`;
type SortKey = 'order' | 'name' | 'terms' | MonthKey;

// Rows in the order they were added, like the spreadsheet.
const DEFAULT_SORT: SortState<SortKey> = { key: 'order', order: 'asc' };

function sortValue(row: Row, key: SortKey) {
  if (key === 'order') return row.id;
  if (key === 'name') return row.name;
  if (key === 'terms') return row.term_count;
  const value = row.months[Number(key.slice(1)) - 1];
  return value == null ? null : toCents(value);
}

// The name column stays visible while scrolling through the months.
const sticky: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
};

interface Props {
  grid: Grid;
  onEdit: (row: Row) => void;
  onDetails: (row: Row) => void;
}

export function InvestmentsGrid({ grid, onEdit, onDetails }: Props) {
  const remove = useDeleteInvestment();
  const [sort, setSort] = useState(DEFAULT_SORT);
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key));
  const th = { sort, onSort };

  // Sorting applies within each group; Total and Resumen stay where they are.
  const [main, occasional] = useMemo(() => {
    const sorted = sortItems(grid.items, sort, sortValue);
    return [
      sorted.filter((r) => r.group === 'main'),
      sorted.filter((r) => r.group === 'occasional'),
    ];
  }, [grid.items, sort]);

  // Months after the current one haven't happened yet; their values are pre-filled.
  const now = dayjs();
  const isFuture = (month: number) =>
    grid.year > now.year() || (grid.year === now.year() && month > now.month() + 1);

  function confirmDelete(row: Row) {
    modals.openConfirmModal({
      title: 'Eliminar inversión',
      children: (
        <Text size="sm">
          ¿Eliminar «{row.name}»? También se eliminan sus saldos de todos los años y sus{' '}
          {row.term_count} plazos.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(row.id),
    });
  }

  const renderRow = (row: Row) => (
    <Table.Tr key={row.id}>
      <Table.Td style={sticky}>
        <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
          {row.name}
        </Text>
      </Table.Td>
      {row.months.map((value, i) => (
        <BalanceCell
          key={i}
          investmentId={row.id}
          name={row.name}
          year={grid.year}
          month={i + 1}
          value={value ?? null}
        />
      ))}
      <Table.Td>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconListDetails size={16} />}
          rightSection={
            row.term_count > 0 ? (
              <Badge size="sm" variant="light" circle={row.term_count < 10}>
                {row.term_count}
              </Badge>
            ) : undefined
          }
          onClick={() => onDetails(row)}
        >
          Detalles
        </Button>
      </Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap" justify="flex-end">
          <ActionIcon variant="subtle" color="gray" aria-label="Editar" onClick={() => onEdit(row)}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Eliminar"
            onClick={() => confirmDelete(row)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );

  const totalRow = (label: string, values: (string | null)[], strong?: boolean) => (
    <Table.Tr fw={700} bg="var(--mantine-color-default-hover)">
      <Table.Td style={{ ...sticky, background: 'inherit' }}>
        <Text size="sm" fw={strong ? 800 : 700} style={{ whiteSpace: 'nowrap' }}>
          {label}
        </Text>
      </Table.Td>
      {values.map((value, i) => (
        <Table.Td key={i} ta="right" style={{ whiteSpace: 'nowrap' }}>
          <Text
            size="sm"
            fw={strong ? 800 : 700}
            c={value !== null && !toCents(value) ? 'dimmed' : undefined}
          >
            {value === null ? '' : formatMoney(value)}
          </Text>
        </Table.Td>
      ))}
      <Table.Td colSpan={2} />
    </Table.Tr>
  );

  return (
    <Table.ScrollContainer minWidth={1700}>
      <Table highlightOnHover striped verticalSpacing={4} withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <SortableTh sortKey="name" style={sticky} {...th}>
              {grid.year}
            </SortableTh>
            {MONTHS.map((label, i) => (
              <SortableTh key={label} sortKey={`m${i + 1}` as MonthKey} ta="right" {...th}>
                {isFuture(i + 1) ? (
                  <Tooltip label="Mes futuro: no cuenta en el resumen ni en el dashboard">
                    <Text span inherit c="dimmed">
                      {label}
                    </Text>
                  </Tooltip>
                ) : (
                  label
                )}
              </SortableTh>
            ))}
            <SortableTh sortKey="terms" {...th}>
              Detalles
            </SortableTh>
            <Table.Th w={80} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {main.map(renderRow)}
          {totalRow(
            'Total',
            grid.totals.main.map((v) => v ?? null),
          )}
          <Table.Tr>
            <Table.Td colSpan={15} style={sticky}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" pt="sm">
                Inversiones ocasionales
              </Text>
            </Table.Td>
          </Table.Tr>
          {occasional.map(renderRow)}
          {occasional.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={15}>
                <Text size="sm" c="dimmed">
                  Ninguna. Crea una inversión del grupo «Ocasional».
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {totalRow(
            'Resumen',
            grid.totals.overall.map((v) => v ?? null),
            true,
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

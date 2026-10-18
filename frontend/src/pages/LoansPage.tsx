import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconCalendar,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { Schemas } from '../api/client';
import { SortableTh } from '../components/SortableTh';
import { useBorrowers, useDeleteLoanEntry, useLoanEntries } from '../features/loans/api';
import { BorrowersModal } from '../features/loans/BorrowersModal';
import { runningBalances } from '../features/loans/ledger';
import { LoanEntryFormModal } from '../features/loans/LoanEntryFormModal';
import { LoanSummaryCards } from '../features/loans/LoanSummaryCards';
import { formatDayMonth } from '../lib/dates';
import { formatMoney, toCents } from '../lib/money';
import { sortItems, toggleSort, type SortState } from '../lib/sort';

type Entry = Schemas['LoanEntryOut'];

type SortKey = 'entry_date' | 'borrower' | 'description' | 'lent' | 'paid' | 'balance';

const ALL = 'all';

// The API returns ledger order (oldest first).
const DEFAULT_SORT: SortState<SortKey> = { key: 'entry_date', order: 'asc' };

export function LoansPage() {
  const [tab, setTab] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search, 300);
  const [[dateFrom, dateTo], setDates] = useState<[string | null, string | null]>([null, null]);
  const [editing, setEditing] = useState<Entry | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [borrowersOpen, setBorrowersOpen] = useState(false);

  const { data: borrowers = [] } = useBorrowers();
  const borrowerNames = useMemo(() => new Map(borrowers.map((b) => [b.id, b.name])), [borrowers]);
  const borrowerId = tab === ALL ? undefined : Number(tab);
  const { data } = useLoanEntries({
    borrower_id: borrowerId ?? null,
    date_from: dateFrom,
    date_to: dateTo,
    q: q || null,
  });
  const filtered = Boolean(q || dateFrom || dateTo);

  function openForm(entry?: Entry) {
    setEditing(entry);
    setFormOpen(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Préstamos</Title>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconUsers size={16} />}
            onClick={() => setBorrowersOpen(true)}
          >
            Deudores
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => openForm()}
            disabled={borrowers.length === 0}
          >
            Nuevo movimiento
          </Button>
        </Group>
      </Group>

      <Tabs value={tab} onChange={(v) => setTab(v ?? ALL)}>
        <Tabs.List>
          <Tabs.Tab value={ALL}>Todos</Tabs.Tab>
          {borrowers.map((b) => (
            <Tabs.Tab key={b.id} value={String(b.id)}>
              {b.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <LoanSummaryCards totals={data?.summary} />

      <Group gap="xs">
        <TextInput
          placeholder="Buscar descripción"
          leftSection={<IconSearch size={16} />}
          w={320}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <DatePickerInput
          type="range"
          placeholder="Rango de fechas"
          aria-label="Rango de fechas"
          leftSection={<IconCalendar size={16} />}
          valueFormat="DD-MMM-YYYY"
          allowSingleDateInRange
          clearable
          w={280}
          value={[dateFrom, dateTo]}
          onChange={setDates}
        />
      </Group>

      <LoansTable
        items={data?.items ?? []}
        summary={data?.summary}
        borrowerNames={borrowerNames}
        showBorrower={borrowerId === undefined}
        // A running balance only makes sense for one borrower's full, unfiltered ledger.
        showBalance={borrowerId !== undefined && !filtered}
        emptyMessage={
          borrowers.length === 0
            ? 'Agrega un deudor en «Deudores» para empezar.'
            : filtered
              ? 'No hay movimientos con estos filtros.'
              : 'No hay movimientos.'
        }
        onEdit={openForm}
      />

      <LoanEntryFormModal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        entry={editing}
        borrowerId={borrowerId}
      />
      <BorrowersModal opened={borrowersOpen} onClose={() => setBorrowersOpen(false)} />
    </Stack>
  );
}

function LoansTable({
  items,
  summary,
  borrowerNames,
  showBorrower,
  showBalance,
  emptyMessage,
  onEdit,
}: {
  items: Entry[];
  summary?: Schemas['LoanTotals'];
  borrowerNames: Map<number, string>;
  showBorrower: boolean;
  showBalance: boolean;
  emptyMessage: string;
  onEdit: (entry: Entry) => void;
}) {
  const remove = useDeleteLoanEntry();
  const [chosenSort, setSort] = useState(DEFAULT_SORT);
  // Switching tabs can hide the sorted column (Deudor, Saldo); fall back to ledger order.
  const hidden = (key: SortKey) =>
    (key === 'borrower' && !showBorrower) || (key === 'balance' && !showBalance);
  const sort = hidden(chosenSort.key) ? DEFAULT_SORT : chosenSort;
  const onSort = (key: SortKey) => setSort(toggleSort(sort, key));
  const th = { sort, onSort };

  // Balances follow ledger order (the API's), whatever order the rows are shown in.
  const balances = useMemo(() => {
    if (!showBalance) return new Map<number, string>();
    const running = runningBalances(items);
    return new Map(items.map((e, i) => [e.id, running[i] ?? '0']));
  }, [items, showBalance]);

  const sorted = useMemo(
    () =>
      sortItems(items, sort, (e, key) => {
        switch (key) {
          case 'borrower':
            return borrowerNames.get(e.borrower_id);
          case 'lent':
          case 'paid':
            return toCents(e[key]);
          case 'balance':
            return toCents(balances.get(e.id) ?? '0');
          default:
            return e[key];
        }
      }),
    [items, sort, borrowerNames, balances],
  );

  function confirmDelete(entry: Entry) {
    modals.openConfirmModal({
      title: 'Eliminar movimiento',
      children: <Text size="sm">¿Eliminar «{entry.description}»?</Text>,
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(entry.id),
    });
  }

  if (items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {emptyMessage}
      </Text>
    );
  }

  const blank = (amount: string) => (Number(amount) === 0 ? '' : formatMoney(amount));
  const leadingCols = showBorrower ? 3 : 2;

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table highlightOnHover striped verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <SortableTh sortKey="entry_date" {...th}>
              Fecha
            </SortableTh>
            {showBorrower && (
              <SortableTh sortKey="borrower" {...th}>
                Deudor
              </SortableTh>
            )}
            <SortableTh sortKey="description" {...th}>
              Descripción
            </SortableTh>
            <SortableTh sortKey="lent" ta="right" {...th}>
              Préstamo
            </SortableTh>
            <SortableTh sortKey="paid" ta="right" {...th}>
              Pagado
            </SortableTh>
            {showBalance && (
              <SortableTh sortKey="balance" ta="right" {...th}>
                Saldo
              </SortableTh>
            )}
            <Table.Th w={80} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((entry) => (
            <Table.Tr key={entry.id}>
              <Table.Td>{formatDayMonth(entry.entry_date)}</Table.Td>
              {showBorrower && <Table.Td>{borrowerNames.get(entry.borrower_id)}</Table.Td>}
              <Table.Td>{entry.description}</Table.Td>
              <Table.Td ta="right">{blank(entry.lent)}</Table.Td>
              <Table.Td ta="right">{blank(entry.paid)}</Table.Td>
              {showBalance && (
                <Table.Td ta="right" fw={600}>
                  {formatMoney(balances.get(entry.id) ?? '0')}
                </Table.Td>
              )}
              <Table.Td>
                <Group gap={4} wrap="nowrap" justify="flex-end">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Editar"
                    onClick={() => onEdit(entry)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Eliminar"
                    onClick={() => confirmDelete(entry)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        {summary && (
          <Table.Tfoot>
            <Table.Tr fw={700}>
              <Table.Td colSpan={leadingCols}>Total ({summary.count})</Table.Td>
              <Table.Td ta="right">{formatMoney(summary.lent)}</Table.Td>
              <Table.Td ta="right">{formatMoney(summary.paid)}</Table.Td>
              <Table.Td colSpan={showBalance ? 2 : 1} />
            </Table.Tr>
          </Table.Tfoot>
        )}
      </Table>
    </Table.ScrollContainer>
  );
}

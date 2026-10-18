import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconArrowsExchange,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Schemas } from '../api/client';
import { SortableTh } from '../components/SortableTh';
import { useAccounts } from '../features/accounts/api';
import { AccountSelect } from '../features/accounts/AccountSelect';
import { categoryLabel, useCategories } from '../features/categories/api';
import { CategorySelect } from '../features/categories/CategorySelect';
import {
  useDeleteTransaction,
  useTransactions,
  type TransactionFilters,
} from '../features/transactions/api';
import { TransactionFormModal } from '../features/transactions/TransactionFormModal';
import { TransferFormModal } from '../features/transactions/TransferFormModal';
import { formatDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { toggleSort, type SortState } from '../lib/sort';

type Transaction = Schemas['TransactionOut'];
type SortKey = NonNullable<TransactionFilters['sort']>;

const SORT_KEYS: SortKey[] = ['date', 'description', 'category', 'account', 'amount'];
// The API's default; it is left out of the URL.
const DEFAULT_SORT: SortState<SortKey> = { key: 'date', order: 'desc' };

const PAGE_SIZE = 50;
const UNCATEGORIZED = 'none';

const KIND_FILTERS = [
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer_out', label: 'Transferencias (salida)' },
  { value: 'transfer_in', label: 'Transferencias (entrada)' },
];

/** Filters live in the URL so they survive reloads and can be linked (e.g. from an account). */
function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const num = (key: string) => (params.get(key) ? Number(params.get(key)) : null);

  const set = (updates: Record<string, string | number | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        if (!('page' in updates)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  return {
    accountId: num('account_id'),
    category: params.get('category'),
    kind: params.get('kind'),
    from: params.get('from'),
    to: params.get('to'),
    q: params.get('q') ?? '',
    sort: parseSort(params.get('sort'), params.get('order')),
    page: num('page') ?? 1,
    set,
  };
}

function parseSort(key: string | null, order: string | null): SortState<SortKey> {
  if (!SORT_KEYS.includes(key as SortKey)) return DEFAULT_SORT;
  return { key: key as SortKey, order: order === 'desc' ? 'desc' : 'asc' };
}

export function TransactionsPage() {
  const f = useFilterParams();
  const [search, setSearch] = useState(f.q);
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (debouncedSearch !== f.q) f.set({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters: TransactionFilters = {
    account_id: f.accountId,
    category_id: f.category && f.category !== UNCATEGORIZED ? Number(f.category) : null,
    uncategorized: f.category === UNCATEGORIZED,
    kind: f.kind as Schemas['TransactionKind'] | null,
    date_from: f.from,
    date_to: f.to,
    q: f.q || null,
    sort: f.sort.key,
    order: f.sort.order,
    limit: PAGE_SIZE,
    offset: (f.page - 1) * PAGE_SIZE,
  };
  const { data, isFetching } = useTransactions(filters);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  function openForm(transaction?: Transaction) {
    setEditing(transaction);
    setFormOpen(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Movimientos</Title>
        <Group>
          <Button
            variant="light"
            leftSection={<IconArrowsExchange size={16} />}
            onClick={() => setTransferOpen(true)}
          >
            Transferencia
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openForm()}>
            Nuevo movimiento
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
          <TextInput
            placeholder="Buscar descripción o comercio"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <AccountSelect
            placeholder="Todas las cuentas"
            clearable
            value={f.accountId}
            onChange={(v) => f.set({ account_id: v })}
          />
          <CategoryFilter value={f.category} onChange={(v) => f.set({ category: v })} />
          <Select
            placeholder="Todos los tipos"
            data={KIND_FILTERS}
            clearable
            value={f.kind}
            onChange={(v) => f.set({ kind: v })}
          />
          <DatePickerInput
            type="range"
            placeholder="Rango de fechas"
            valueFormat="DD/MM/YYYY"
            clearable
            value={[f.from, f.to]}
            onChange={([from, to]) => f.set({ from, to })}
          />
        </SimpleGrid>
      </Card>

      <TransactionsTable
        items={data?.items ?? []}
        loading={isFetching}
        sort={f.sort}
        onSort={(key) => {
          const next = toggleSort(f.sort, key);
          const isDefault = next.key === DEFAULT_SORT.key && next.order === DEFAULT_SORT.order;
          f.set(isDefault ? { sort: null, order: null } : { sort: next.key, order: next.order });
        }}
        onEdit={openForm}
      />

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data ? `${data.total} movimientos` : ''}
        </Text>
        {pages > 1 && (
          <Pagination total={pages} value={f.page} onChange={(page) => f.set({ page })} />
        )}
      </Group>

      <TransactionFormModal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
        defaultAccountId={f.accountId}
      />
      <TransferFormModal opened={transferOpen} onClose={() => setTransferOpen(false)} />
    </Stack>
  );
}

function CategoryFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (value === UNCATEGORIZED) {
    return (
      <Select
        data={[{ value: UNCATEGORIZED, label: 'Sin categoría' }]}
        value={UNCATEGORIZED}
        clearable
        onChange={onChange}
      />
    );
  }
  return (
    <Group gap={4} wrap="nowrap">
      <CategorySelect
        placeholder="Todas las categorías"
        value={value ? Number(value) : null}
        onChange={(v) => onChange(v === null ? null : String(v))}
        style={{ flex: 1 }}
      />
      <Button variant="subtle" size="compact-xs" onClick={() => onChange(UNCATEGORIZED)}>
        Sin cat.
      </Button>
    </Group>
  );
}

function TransactionsTable({
  items,
  loading,
  sort,
  onSort,
  onEdit,
}: {
  items: Transaction[];
  loading: boolean;
  sort: SortState<SortKey>;
  onSort: (key: SortKey) => void;
  onEdit: (t: Transaction) => void;
}) {
  const th = { sort, onSort };
  const { data: accounts = [] } = useAccounts(true);
  const { data: categories = [] } = useCategories();
  const remove = useDeleteTransaction();

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  function confirmDelete(t: Transaction) {
    const transfer = t.transfer_peer_id !== null;
    modals.openConfirmModal({
      title: 'Eliminar movimiento',
      children: (
        <Text size="sm">
          ¿Eliminar «{t.description}»?
          {transfer && ' Se eliminarán ambos lados de la transferencia.'}
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(t.id),
    });
  }

  if (!loading && items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No hay movimientos con estos filtros.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={720}>
      <Table highlightOnHover verticalSpacing="xs" style={{ opacity: loading ? 0.6 : 1 }}>
        <Table.Thead>
          <Table.Tr>
            <SortableTh sortKey="date" {...th}>
              Fecha
            </SortableTh>
            <SortableTh sortKey="description" {...th}>
              Descripción
            </SortableTh>
            <SortableTh sortKey="category" {...th}>
              Categoría
            </SortableTh>
            <SortableTh sortKey="account" {...th}>
              Cuenta
            </SortableTh>
            <SortableTh sortKey="amount" ta="right" {...th}>
              Monto
            </SortableTh>
            <Table.Th w={80} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((t) => {
            const account = accountById.get(t.account_id);
            const counterpart = t.counterpart_account_id
              ? accountById.get(t.counterpart_account_id)
              : undefined;
            const category = t.category_id ? categoryById.get(t.category_id) : undefined;
            const inflow = t.kind === 'income' || t.kind === 'transfer_in';
            const transfer = t.kind === 'transfer_in' || t.kind === 'transfer_out';
            return (
              <Table.Tr key={t.id}>
                <Table.Td>{formatDate(t.date)}</Table.Td>
                <Table.Td>
                  <Text size="sm">{t.description}</Text>
                  {t.merchant && (
                    <Text size="xs" c="dimmed">
                      {t.merchant}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {transfer ? (
                    <Badge
                      variant="light"
                      color="gray"
                      leftSection={<IconArrowsExchange size={12} />}
                    >
                      {t.kind === 'transfer_out' ? 'a' : 'de'} {counterpart?.name ?? '—'}
                    </Badge>
                  ) : category ? (
                    <Text size="sm">{categoryLabel(category, categories)}</Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Sin categoría
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{account?.name}</Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" fw={600} c={transfer ? 'dimmed' : inflow ? 'teal' : undefined}>
                    {inflow ? '+' : '−'}
                    {formatMoney(t.amount, account?.currency)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap" justify="flex-end">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Editar"
                      onClick={() => onEdit(t)}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Eliminar"
                      onClick={() => confirmDelete(t)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

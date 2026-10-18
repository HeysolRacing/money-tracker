import {
  ActionIcon,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPencil, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { Schemas } from '../api/client';
import { useDeleteInvoice, useInvoices, useSaveInvoice } from '../features/invoices/api';
import { InvoiceFormModal } from '../features/invoices/InvoiceFormModal';
import { InvoiceSummaryCards } from '../features/invoices/InvoiceSummaryCards';
import { SortableTh } from '../components/SortableTh';
import { formatDayMonth } from '../lib/dates';
import { formatMoney, toCents } from '../lib/money';
import { sortItems, toggleSort, type SortState } from '../lib/sort';

type Invoice = Schemas['InvoiceOut'];
type SortKey =
  'application_date' | 'concept' | 'subtotal' | 'iva' | 'total' | 'is_invoiced' | 'is_extra';

// The API returns newest first.
const DEFAULT_SORT: SortState<SortKey> = { key: 'application_date', order: 'desc' };

function sortValue(invoice: Invoice, key: SortKey) {
  switch (key) {
    case 'subtotal':
    case 'iva':
    case 'total':
      return toCents(invoice[key]);
    default:
      return invoice[key];
  }
}

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
].map((label, i) => ({ value: String(i + 1), label }));

const YES_NO = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
];

const currentYear = dayjs().year();
const YEARS = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

const toBool = (v: string | null) => (v === null ? null : v === 'true');

export function InvoicesPage() {
  const [year, setYear] = useState<string | null>(String(currentYear));
  const [month, setMonth] = useState<string | null>(null);
  const [invoiced, setInvoiced] = useState<string | null>(null);
  const [extra, setExtra] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search, 300);
  const [editing, setEditing] = useState<Invoice | undefined>();
  const [formOpen, setFormOpen] = useState(false);

  const { data } = useInvoices({
    year: year ? Number(year) : null,
    month: month ? Number(month) : null,
    is_invoiced: toBool(invoiced),
    is_extra: toBool(extra),
    q: q || null,
  });

  function openForm(invoice?: Invoice) {
    setEditing(invoice);
    setFormOpen(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Facturas</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => openForm()}>
          Nueva factura
        </Button>
      </Group>

      <InvoiceSummaryCards summary={data?.summary} />

      <Card withBorder radius="md" padding="sm">
        <SimpleGrid cols={{ base: 2, md: 5 }}>
          <Select
            label="Año"
            data={YEARS}
            clearable
            placeholder="Todos"
            value={year}
            onChange={setYear}
          />
          <Select
            label="Mes"
            data={MONTHS}
            clearable
            placeholder="Todos"
            value={month}
            onChange={setMonth}
          />
          <Select
            label="Facturado"
            data={YES_NO}
            clearable
            placeholder="Todos"
            value={invoiced}
            onChange={setInvoiced}
          />
          <Select
            label="Extra"
            data={YES_NO}
            clearable
            placeholder="Todos"
            value={extra}
            onChange={setExtra}
          />
          <TextInput
            label="Concepto"
            placeholder="Buscar"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </SimpleGrid>
      </Card>

      <InvoicesTable items={data?.items ?? []} summary={data?.summary} onEdit={openForm} />

      <InvoiceFormModal opened={formOpen} onClose={() => setFormOpen(false)} invoice={editing} />
    </Stack>
  );
}

function InvoicesTable({
  items,
  summary,
  onEdit,
}: {
  items: Invoice[];
  summary?: Schemas['InvoiceSummary'];
  onEdit: (invoice: Invoice) => void;
}) {
  const save = useSaveInvoice();
  const remove = useDeleteInvoice();
  const [sort, setSort] = useState(DEFAULT_SORT);
  const sorted = useMemo(() => sortItems(items, sort, sortValue), [items, sort]);
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key));
  const th = { sort, onSort };

  function confirmDelete(invoice: Invoice) {
    modals.openConfirmModal({
      title: 'Eliminar factura',
      children: <Text size="sm">¿Eliminar «{invoice.concept}»?</Text>,
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(invoice.id),
    });
  }

  if (items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No hay facturas con estos filtros.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={760}>
      <Table highlightOnHover striped verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <SortableTh sortKey="application_date" {...th}>
              Fecha Aplicación
            </SortableTh>
            <SortableTh sortKey="concept" {...th}>
              Concepto
            </SortableTh>
            <SortableTh sortKey="subtotal" ta="right" {...th}>
              Subtotal
            </SortableTh>
            <SortableTh sortKey="iva" ta="right" {...th}>
              I.V.A
            </SortableTh>
            <SortableTh sortKey="total" ta="right" {...th}>
              Total
            </SortableTh>
            <SortableTh sortKey="is_invoiced" ta="center" {...th}>
              Facturado
            </SortableTh>
            <SortableTh sortKey="is_extra" ta="center" {...th}>
              Extra
            </SortableTh>
            <Table.Th w={80} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((invoice) => (
            <Table.Tr key={invoice.id}>
              <Table.Td>{formatDayMonth(invoice.application_date)}</Table.Td>
              <Table.Td>{invoice.concept}</Table.Td>
              <Table.Td ta="right">{formatMoney(invoice.subtotal)}</Table.Td>
              <Table.Td ta="right">{formatMoney(invoice.iva)}</Table.Td>
              <Table.Td ta="right" fw={600}>
                {formatMoney(invoice.total)}
              </Table.Td>
              <Table.Td>
                <Checkbox
                  aria-label="Facturado"
                  mx="auto"
                  w="fit-content"
                  checked={invoice.is_invoiced}
                  onChange={(e) =>
                    save.mutate({ id: invoice.id, body: { is_invoiced: e.currentTarget.checked } })
                  }
                />
              </Table.Td>
              <Table.Td>
                <Checkbox
                  aria-label="Extra"
                  mx="auto"
                  w="fit-content"
                  color="grape"
                  checked={invoice.is_extra}
                  onChange={(e) =>
                    save.mutate({ id: invoice.id, body: { is_extra: e.currentTarget.checked } })
                  }
                />
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap" justify="flex-end">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Editar"
                    onClick={() => onEdit(invoice)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Eliminar"
                    onClick={() => confirmDelete(invoice)}
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
              <Table.Td colSpan={2}>Total ({summary.all.count})</Table.Td>
              <Table.Td ta="right">{formatMoney(summary.all.subtotal)}</Table.Td>
              <Table.Td ta="right">{formatMoney(summary.all.iva)}</Table.Td>
              <Table.Td ta="right">{formatMoney(summary.all.total)}</Table.Td>
              <Table.Td colSpan={3} />
            </Table.Tr>
          </Table.Tfoot>
        )}
      </Table>
    </Table.ScrollContainer>
  );
}

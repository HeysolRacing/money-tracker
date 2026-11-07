import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import dayjs from 'dayjs';
import { IconPencil, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { Schemas } from '../../api/client';
import { SortableTh } from '../../components/SortableTh';
import { formatDate } from '../../lib/dates';
import { formatMoney, fromCents, toCents } from '../../lib/money';
import { sortItems, toggleSort, type SortState } from '../../lib/sort';
import { useDeleteTerm, useTerms } from './api';
import { periodLabel } from './interest';
import { TermFormModal } from './TermFormModal';

type Term = Schemas['TermOut'];
type SortKey =
  | 'start_date'
  | 'days'
  | 'annual_rate'
  | 'amount'
  | 'interest'
  | 'isr_withheld'
  | 'net_interest'
  | 'final_amount'
  | 'status';

const DEFAULT_SORT: SortState<SortKey> = { key: 'start_date', order: 'asc' };
const MONEY_KEYS = new Set<SortKey>([
  'amount',
  'interest',
  'isr_withheld',
  'net_interest',
  'final_amount',
]);
const STATUS_ORDER: Record<Term['status'], number> = { matured: 0, active: 1, scheduled: 2 };

interface Props {
  investment?: { id: number; name: string };
  onClose: () => void;
}

/** "Detalles": every term (plazo) of one investment, oldest first, with what each earned. */
export function TermsModal({ investment, onClose }: Props) {
  return (
    <Modal
      opened={investment !== undefined}
      onClose={onClose}
      title={investment ? `Plazos · ${investment.name}` : ''}
      size="80rem"
    >
      {investment && <TermsDetails investmentId={investment.id} />}
    </Modal>
  );
}

type FormState = { term?: Term; renewFrom?: Term } | null;

function TermsDetails({ investmentId }: { investmentId: number }) {
  const { data } = useTerms(investmentId);
  const remove = useDeleteTerm();
  const [form, setForm] = useState<FormState>(null);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key));
  const th = { sort, onSort };

  const items = useMemo(() => data?.items ?? [], [data]);
  const sorted = useMemo(
    () =>
      sortItems(items, sort, (t, key) =>
        key === 'status'
          ? STATUS_ORDER[t.status]
          : key === 'annual_rate'
            ? Number(t.annual_rate)
            : MONEY_KEYS.has(key)
              ? toCents(t[key as 'amount'])
              : t[key as 'start_date' | 'days'],
      ),
    [items, sort],
  );

  function confirmDelete(term: Term) {
    modals.openConfirmModal({
      title: 'Eliminar plazo',
      children: (
        <Text size="sm">
          ¿Eliminar el plazo de {formatMoney(term.amount)} del {formatDate(term.start_date)}?
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(term.id),
    });
  }

  const totals = data?.totals;
  const sum = (key: 'interest' | 'isr_withheld' | 'net_interest') =>
    fromCents(items.reduce((cents, t) => cents + toCents(t[key]), 0));

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat
          label="Plazos"
          value={String(totals?.count ?? 0)}
          hint={`${totals?.running ?? 0} vigentes`}
        />
        <Stat
          // Terms can run in parallel, so this is the sum of every term not yet matured.
          label="Monto invertido"
          value={totals?.running ? formatMoney(totals.invested) : '—'}
          hint={
            totals?.running
              ? `En ${totals.running} ${totals.running === 1 ? 'plazo vigente' : 'plazos vigentes'}; al vencer ${formatMoney(totals.invested_at_maturity)}`
              : 'Sin plazos vigentes'
          }
        />
        <Stat
          label="Interés ganado"
          value={formatMoney(totals?.net_interest ?? '0')}
          hint="Neto de ISR, plazos vencidos"
          color="teal"
        />
        <Stat
          label="Interés por cobrar"
          value={formatMoney(totals?.expected_interest ?? '0')}
          hint="Neto de ISR, plazos vigentes"
          color="orange"
        />
      </SimpleGrid>

      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Interés = monto × tasa anual × días / 360.
        </Text>
        <Group gap="xs">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setForm({})}>
            Nuevo plazo
          </Button>
        </Group>
      </Group>

      {items.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          Aún no hay plazos. Agrega uno con «Nuevo plazo».
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={1000}>
          <Table highlightOnHover striped verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <SortableTh sortKey="start_date" {...th}>
                  Periodo
                </SortableTh>
                <SortableTh sortKey="days" ta="right" {...th}>
                  Días
                </SortableTh>
                <SortableTh sortKey="annual_rate" ta="right" {...th}>
                  Tasa
                </SortableTh>
                <SortableTh sortKey="amount" ta="right" {...th}>
                  Monto
                </SortableTh>
                <SortableTh sortKey="interest" ta="right" {...th}>
                  Interés
                </SortableTh>
                <SortableTh sortKey="isr_withheld" ta="right" {...th}>
                  ISR
                </SortableTh>
                <SortableTh sortKey="net_interest" ta="right" {...th}>
                  Neto
                </SortableTh>
                <SortableTh sortKey="final_amount" ta="right" {...th}>
                  Monto + interés
                </SortableTh>
                <SortableTh sortKey="status" {...th}>
                  Estado
                </SortableTh>
                <Table.Th w={110} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    <Text size="sm" fw={600} tt="capitalize">
                      {periodLabel(t.start_date, t.end_date)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDate(t.start_date)} → {formatDate(t.end_date)}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{t.days}</Table.Td>
                  <Table.Td ta="right">{t.annual_rate}%</Table.Td>
                  <Table.Td ta="right">{formatMoney(t.amount)}</Table.Td>
                  <Table.Td ta="right">{formatMoney(t.interest)}</Table.Td>
                  <Table.Td ta="right">
                    {Number(t.isr_withheld) ? formatMoney(t.isr_withheld) : ''}
                  </Table.Td>
                  <Table.Td ta="right">{formatMoney(t.net_interest)}</Table.Td>
                  <Table.Td ta="right" fw={700}>
                    {formatMoney(t.final_amount)}
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge term={t} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Tooltip label="Renovar: nuevo plazo al vencer, con monto + interés">
                        <ActionIcon
                          variant="subtle"
                          aria-label="Renovar"
                          onClick={() => setForm({ renewFrom: t })}
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Editar"
                        onClick={() => setForm({ term: t })}
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
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr fw={700}>
                <Table.Td colSpan={4}>Total ({items.length})</Table.Td>
                <Table.Td ta="right">{formatMoney(sum('interest'))}</Table.Td>
                <Table.Td ta="right">{formatMoney(sum('isr_withheld'))}</Table.Td>
                <Table.Td ta="right">{formatMoney(sum('net_interest'))}</Table.Td>
                <Table.Td colSpan={3} />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      )}

      <TermFormModal
        opened={form !== null}
        onClose={() => setForm(null)}
        investmentId={investmentId}
        term={form?.term}
        renewFrom={form?.renewFrom}
      />
    </Stack>
  );
}

function StatusBadge({ term }: { term: Term }) {
  if (term.status === 'matured') {
    return (
      <Badge variant="light" color="gray">
        Vencido
      </Badge>
    );
  }
  if (term.status === 'scheduled') {
    return (
      <Badge variant="light" color="blue">
        Programado
      </Badge>
    );
  }
  const daysLeft = dayjs(term.end_date).diff(dayjs().startOf('day'), 'day');
  return (
    <Tooltip label={`Vence el ${formatDate(term.end_date)}`}>
      <Badge variant="light" color="teal">
        Vigente · {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
      </Badge>
    </Tooltip>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color?: string;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      style={color ? { borderLeft: `4px solid var(--mantine-color-${color}-6)` } : undefined}
    >
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={700}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Card>
  );
}

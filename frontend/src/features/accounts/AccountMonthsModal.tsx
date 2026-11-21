import { Alert, Badge, Loader, Modal, Table, Text } from '@mantine/core';
import dayjs from 'dayjs';
import 'dayjs/locale/es-mx';
import type { Schemas } from '../../api/client';
import { formatDate } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { useAccountMonths } from './api';

interface Props {
  account: Schemas['AccountOut'];
  opened: boolean;
  onClose: () => void;
}

/** "Octubre 2026": the month the period ends in. */
function monthLabel(month: Schemas['AccountMonth']) {
  const label = dayjs(new Date(month.year, month.month - 1, 1))
    .locale('es-mx')
    .format('MMMM YYYY');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function AccountMonthsModal({ account, opened, onClose }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`${account.name} — resumen por mes`}
      size="70rem"
    >
      {opened && <MonthsTable account={account} />}
    </Modal>
  );
}

function MonthsTable({ account }: { account: Schemas['AccountOut'] }) {
  const { data: months, isPending, error } = useAccountMonths(account.id);

  if (isPending) return <Loader />;
  if (error) return <Alert color="red">{error.message}</Alert>;
  if (months.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Esta cuenta aún no tiene movimientos.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={680}>
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Mes</Table.Th>
            <Table.Th>Periodo</Table.Th>
            <Table.Th ta="right">Movimientos</Table.Th>
            <Table.Th ta="right">Cargos</Table.Th>
            <Table.Th ta="right">Abonos</Table.Th>
            <Table.Th>Carga</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {months.map((m) => (
            <Table.Tr key={`${m.year}-${m.month}`}>
              <Table.Td fw={600}>{monthLabel(m)}</Table.Td>
              <Table.Td>
                {formatDate(m.period_start)} al {formatDate(m.period_end)}
              </Table.Td>
              {m.missing ? (
                <Table.Td colSpan={3} ta="center">
                  <Text size="sm" c="dimmed">
                    — sin cargar —
                  </Text>
                </Table.Td>
              ) : (
                <>
                  <Table.Td ta="right">{m.movement_count}</Table.Td>
                  <Table.Td ta="right">{formatMoney(m.charges_total, account.currency)}</Table.Td>
                  <Table.Td ta="right" c="teal">
                    {formatMoney(m.credits_total, account.currency)}
                  </Table.Td>
                </>
              )}
              <Table.Td>
                {m.loaded_at ? (
                  <Badge variant="light">PDF · {formatDate(m.loaded_at)}</Badge>
                ) : m.missing ? (
                  <Badge variant="light" color="yellow">
                    Falta PDF
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    {m.movement_count > 0 ? 'Manual' : '—'}
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

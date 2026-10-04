import { ActionIcon, Badge, Card, Group, Menu, Progress, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArchive, IconDots, IconList, IconPencil, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { Schemas } from '../../api/client';
import { formatDate, nextDayOfMonth } from '../../lib/dates';
import { ACCOUNT_TYPE_LABELS } from '../../lib/labels';
import { addMoney, formatMoney, toCents } from '../../lib/money';
import { useArchiveAccount, useDeleteAccount } from './api';

interface Props {
  account: Schemas['AccountOut'];
  onEdit: () => void;
}

export function AccountCard({ account, onEdit }: Props) {
  const archive = useArchiveAccount();
  const remove = useDeleteAccount();
  const isCard = account.type === 'credit_card';

  function confirmDelete() {
    modals.openConfirmModal({
      title: 'Eliminar cuenta',
      children: (
        <Text size="sm">¿Eliminar «{account.name}»? Esta acción no se puede deshacer.</Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(account.id),
    });
  }

  return (
    <Card withBorder radius="md" opacity={account.is_archived ? 0.6 : 1}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={600}>{account.name}</Text>
          <Group gap={6} mt={4}>
            {account.bank && <Badge variant="light">{account.bank}</Badge>}
            <Badge variant="outline" color="gray">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </Badge>
            {account.currency !== 'MXN' && <Badge color="yellow">{account.currency}</Badge>}
            {account.is_archived && <Badge color="gray">Archivada</Badge>}
          </Group>
        </div>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label="Acciones">
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconList size={16} />}
              component={Link}
              to={`/movimientos?account_id=${account.id}`}
            >
              Ver movimientos
            </Menu.Item>
            <Menu.Item leftSection={<IconPencil size={16} />} onClick={onEdit}>
              Editar
            </Menu.Item>
            <Menu.Item
              leftSection={<IconArchive size={16} />}
              onClick={() => archive.mutate({ id: account.id, archived: !account.is_archived })}
            >
              {account.is_archived ? 'Desarchivar' : 'Archivar'}
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
              Eliminar
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {isCard ? <CardDetails account={account} /> : <Balance account={account} />}
    </Card>
  );
}

function Balance({ account }: { account: Schemas['AccountOut'] }) {
  const negative = toCents(account.balance) < 0;
  return (
    <Stack gap={0} mt="md">
      <Text size="xs" c="dimmed">
        Saldo
      </Text>
      <Text size="xl" fw={700} c={negative ? 'red' : undefined}>
        {formatMoney(account.balance, account.currency)}
      </Text>
    </Stack>
  );
}

function CardDetails({ account }: { account: Schemas['AccountOut'] }) {
  // Card balance is negative while there's debt.
  const debtCents = Math.max(-toCents(account.balance), 0);
  const debt = (debtCents / 100).toFixed(2);
  const limit = account.credit_limit;
  const available = limit ? addMoney(limit, account.balance) : null;
  const used = limit && toCents(limit) > 0 ? (debtCents / toCents(limit)) * 100 : 0;

  return (
    <Stack gap="xs" mt="md">
      <Group justify="space-between">
        <div>
          <Text size="xs" c="dimmed">
            Deuda
          </Text>
          <Text size="xl" fw={700} c={debtCents > 0 ? 'red' : undefined}>
            {formatMoney(debt, account.currency)}
          </Text>
        </div>
        {available && (
          <div style={{ textAlign: 'right' }}>
            <Text size="xs" c="dimmed">
              Disponible
            </Text>
            <Text fw={600}>{formatMoney(available, account.currency)}</Text>
          </div>
        )}
      </Group>
      {limit && (
        <Progress
          value={Math.min(used, 100)}
          color={used > 80 ? 'red' : used > 50 ? 'yellow' : 'teal'}
        />
      )}
      <Group gap="lg">
        {account.statement_day && (
          <Text size="xs" c="dimmed">
            Corte: {formatDate(nextDayOfMonth(account.statement_day))}
          </Text>
        )}
        {account.payment_due_day && (
          <Text size="xs" c="dimmed">
            Pago: {formatDate(nextDayOfMonth(account.payment_due_day))}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

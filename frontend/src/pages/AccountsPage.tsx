import {
  Alert,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import type { Schemas } from '../api/client';
import { useAccounts } from '../features/accounts/api';
import { AccountCard } from '../features/accounts/AccountCard';
import { AccountFormModal } from '../features/accounts/AccountFormModal';

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: accounts, isPending, error } = useAccounts(showArchived);
  const [editing, setEditing] = useState<Schemas['AccountOut'] | undefined>();
  const [formOpen, setFormOpen] = useState(false);

  function openForm(account?: Schemas['AccountOut']) {
    setEditing(account);
    setFormOpen(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Cuentas</Title>
        <Group>
          <Switch
            label="Mostrar archivadas"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.currentTarget.checked)}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={() => openForm()}>
            Nueva cuenta
          </Button>
        </Group>
      </Group>

      {isPending && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {accounts?.length === 0 && (
        <Text c="dimmed">
          Aún no tienes cuentas. Agrega tus cuentas de débito, tarjetas y efectivo.
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {accounts?.map((account) => (
          <AccountCard key={account.id} account={account} onEdit={() => openForm(account)} />
        ))}
      </SimpleGrid>

      <AccountFormModal opened={formOpen} onClose={() => setFormOpen(false)} account={editing} />
    </Stack>
  );
}

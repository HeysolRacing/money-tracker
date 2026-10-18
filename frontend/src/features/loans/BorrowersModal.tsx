import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import type { Schemas } from '../../api/client';
import { formatMoney } from '../../lib/money';
import { useBorrowers, useDeleteBorrower, useSaveBorrower } from './api';

type Borrower = Schemas['BorrowerOut'];

/** Add, rename and delete borrowers (Deudores). */
export function BorrowersModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: borrowers = [] } = useBorrowers();
  const save = useSaveBorrower();
  const [name, setName] = useState('');

  function add() {
    if (!name.trim()) return;
    save.mutate({ body: { name } }, { onSuccess: () => setName('') });
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Deudores">
      <Stack gap="xs">
        {borrowers.map((b) => (
          <BorrowerRow key={b.id} borrower={b} />
        ))}
        {borrowers.length === 0 && (
          <Text size="sm" c="dimmed">
            Aún no hay deudores.
          </Text>
        )}
        <Group gap="xs" align="flex-end" mt="sm">
          <TextInput
            label="Nuevo deudor"
            placeholder="Nombre"
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={add} loading={save.isPending}>
            Agregar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function BorrowerRow({ borrower }: { borrower: Borrower }) {
  const save = useSaveBorrower();
  const remove = useDeleteBorrower();
  const [editing, setEditing] = useState<string | null>(null);

  function rename() {
    if (!editing?.trim()) return;
    save.mutate(
      { id: borrower.id, body: { name: editing } },
      { onSuccess: () => setEditing(null) },
    );
  }

  function confirmDelete() {
    modals.openConfirmModal({
      title: 'Eliminar deudor',
      children: <Text size="sm">¿Eliminar a «{borrower.name}»?</Text>,
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(borrower.id),
    });
  }

  if (editing !== null) {
    return (
      <Group gap="xs" wrap="nowrap">
        <TextInput
          aria-label="Nombre"
          style={{ flex: 1 }}
          value={editing}
          autoFocus
          onChange={(e) => setEditing(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename();
            if (e.key === 'Escape') setEditing(null);
          }}
        />
        <ActionIcon variant="subtle" aria-label="Guardar" onClick={rename} loading={save.isPending}>
          <IconCheck size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Cancelar"
          onClick={() => setEditing(null)}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
    );
  }

  return (
    <Group justify="space-between" wrap="nowrap">
      <div>
        <Text size="sm" fw={600}>
          {borrower.name}
        </Text>
        <Text size="xs" c="dimmed">
          {borrower.totals.count} movimientos · Saldo {formatMoney(borrower.totals.balance)}
        </Text>
      </div>
      <Group gap={4} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Renombrar"
          onClick={() => setEditing(borrower.name)}
        >
          <IconPencil size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" aria-label="Eliminar" onClick={confirmDelete}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

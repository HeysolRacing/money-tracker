import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { today } from '../../lib/dates';
import { useBorrowers, useSaveLoanEntry } from './api';

type Entry = Schemas['LoanEntryOut'];

interface Props {
  opened: boolean;
  onClose: () => void;
  entry?: Entry;
  /** Borrower preselected for a new entry (the open tab). */
  borrowerId?: number;
}

export function LoanEntryFormModal({ opened, onClose, entry, borrowerId }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={entry ? 'Editar movimiento' : 'Nuevo movimiento'}
    >
      <LoanEntryForm entry={entry} borrowerId={borrowerId} onDone={onClose} />
    </Modal>
  );
}

const isZero = (v: string | number) => v === '' || Number(v) === 0;

function LoanEntryForm({
  entry,
  borrowerId,
  onDone,
}: {
  entry?: Entry;
  borrowerId?: number;
  onDone: () => void;
}) {
  const save = useSaveLoanEntry();
  const { data: borrowers = [] } = useBorrowers();
  const form = useForm({
    initialValues: {
      borrower_id: String(entry?.borrower_id ?? borrowerId ?? ''),
      entry_date: entry?.entry_date ?? today(),
      description: entry?.description ?? '',
      lent: (entry && !isZero(entry.lent) ? entry.lent : '') as string | number,
      paid: (entry && !isZero(entry.paid) ? entry.paid : '') as string | number,
    },
    validate: {
      borrower_id: (v) => (v ? null : 'Elige un deudor'),
      entry_date: (v) => (v ? null : 'Elige una fecha'),
      description: (v) => (v.trim() ? null : 'Escribe una descripción'),
      paid: (v, values) =>
        isZero(v) && isZero(values.lent) ? 'Escribe un préstamo o un pago' : null,
    },
  });

  function handleSubmit(values: typeof form.values) {
    save.mutate(
      {
        id: entry?.id,
        body: {
          borrower_id: Number(values.borrower_id),
          entry_date: values.entry_date,
          description: values.description,
          lent: String(values.lent || 0),
          paid: String(values.paid || 0),
        },
      },
      { onSuccess: onDone },
    );
  }

  const money = {
    min: 0,
    decimalScale: 2,
    thousandSeparator: ',',
    prefix: '$',
    hideControls: true,
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <Select
          label="Deudor"
          data={borrowers.map((b) => ({ value: String(b.id), label: b.name }))}
          searchable
          {...form.getInputProps('borrower_id')}
        />
        <DateInput label="Fecha" valueFormat="DD-MMM-YYYY" {...form.getInputProps('entry_date')} />
        <TextInput label="Descripción" data-autofocus {...form.getInputProps('description')} />
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput label="Préstamo" {...money} {...form.getInputProps('lent')} />
          <NumberInput label="Pagado" {...money} {...form.getInputProps('paid')} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

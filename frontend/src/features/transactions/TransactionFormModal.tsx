import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { today } from '../../lib/dates';
import { AccountSelect } from '../accounts/AccountSelect';
import { CategorySelect } from '../categories/CategorySelect';
import { useSaveTransaction, useUpdateTransfer } from './api';

type Transaction = Schemas['TransactionOut'];
type SimpleKind = 'expense' | 'income';

interface Props {
  opened: boolean;
  onClose: () => void;
  transaction?: Transaction;
  defaultAccountId?: number | null;
}

const isTransfer = (t?: Transaction) => t?.kind === 'transfer_in' || t?.kind === 'transfer_out';

export function TransactionFormModal({ opened, onClose, transaction, defaultAccountId }: Props) {
  const title = isTransfer(transaction)
    ? 'Editar transferencia'
    : transaction
      ? 'Editar movimiento'
      : 'Nuevo movimiento';
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      {isTransfer(transaction) ? (
        <TransferEditForm transaction={transaction!} onDone={onClose} />
      ) : (
        <TransactionForm
          transaction={transaction}
          defaultAccountId={defaultAccountId}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function TransactionForm({
  transaction,
  defaultAccountId,
  onDone,
}: {
  transaction?: Transaction;
  defaultAccountId?: number | null;
  onDone: () => void;
}) {
  const save = useSaveTransaction();
  const form = useForm({
    initialValues: {
      kind: (transaction?.kind ?? 'expense') as SimpleKind,
      account_id: transaction?.account_id ?? defaultAccountId ?? null,
      date: transaction?.date ?? today(),
      amount: (transaction?.amount ?? '') as string | number,
      description: transaction?.description ?? '',
      merchant: transaction?.merchant ?? '',
      category_id: transaction?.category_id ?? null,
      notes: transaction?.notes ?? '',
    },
    validate: {
      account_id: (v) => (v ? null : 'Elige una cuenta'),
      amount: (v) => (Number(v) > 0 ? null : 'El monto debe ser mayor a cero'),
      description: (v) => (v.trim() ? null : 'Escribe una descripción'),
      date: (v) => (v ? null : 'Elige una fecha'),
    },
  });

  function handleSubmit(values: typeof form.values) {
    save.mutate(
      {
        id: transaction?.id,
        body: {
          kind: values.kind,
          account_id: values.account_id!,
          date: values.date,
          amount: String(values.amount),
          description: values.description,
          merchant: values.merchant || null,
          category_id: values.category_id,
          notes: values.notes || null,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <SegmentedControl
          data={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Ingreso' },
          ]}
          value={form.values.kind}
          onChange={(v) => {
            form.setFieldValue('kind', v as SimpleKind);
            // Categories are per kind; a gasto category doesn't apply to an ingreso.
            form.setFieldValue('category_id', null);
          }}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <AccountSelect label="Cuenta" {...form.getInputProps('account_id')} />
          <DateInput label="Fecha" valueFormat="DD/MM/YYYY" {...form.getInputProps('date')} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <NumberInput
            label="Monto"
            min={0}
            decimalScale={2}
            thousandSeparator=","
            prefix="$"
            data-autofocus
            {...form.getInputProps('amount')}
          />
          <CategorySelect
            label="Categoría"
            kind={form.values.kind}
            {...form.getInputProps('category_id')}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="Descripción" {...form.getInputProps('description')} />
          <TextInput label="Comercio (opcional)" {...form.getInputProps('merchant')} />
        </SimpleGrid>
        <Textarea label="Notas" autosize minRows={1} {...form.getInputProps('notes')} />
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function TransferEditForm({
  transaction,
  onDone,
}: {
  transaction: Transaction;
  onDone: () => void;
}) {
  const update = useUpdateTransfer();
  const form = useForm({
    initialValues: {
      date: transaction.date,
      description: transaction.description,
      notes: transaction.notes ?? '',
    },
  });

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        update.mutate(
          { id: transaction.id, body: { ...values, notes: values.notes || null } },
          { onSuccess: onDone },
        ),
      )}
    >
      <Stack>
        <Alert color="blue" variant="light">
          Para cambiar las cuentas o el monto de una transferencia, elimínala y créala de nuevo.
        </Alert>
        <DateInput label="Fecha" valueFormat="DD/MM/YYYY" {...form.getInputProps('date')} />
        <TextInput label="Descripción" {...form.getInputProps('description')} />
        <Textarea label="Notas" autosize minRows={1} {...form.getInputProps('notes')} />
        <Group justify="flex-end">
          <Button type="submit" loading={update.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

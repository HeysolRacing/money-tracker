import {
  Button,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { today } from '../../lib/dates';
import { useAccounts } from '../accounts/api';
import { AccountSelect } from '../accounts/AccountSelect';
import { useCreateTransfer } from './api';

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function TransferFormModal({ opened, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Transferencia / pago de tarjeta" size="lg">
      <TransferForm onDone={onClose} />
    </Modal>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const create = useCreateTransfer();
  const form = useForm({
    initialValues: {
      from_account_id: null as number | null,
      to_account_id: null as number | null,
      date: today(),
      amount: '' as string | number,
      to_amount: '' as string | number,
      description: 'Transferencia',
      notes: '',
    },
    validate: {
      from_account_id: (v) => (v ? null : 'Elige la cuenta de origen'),
      to_account_id: (v, values) =>
        !v
          ? 'Elige la cuenta de destino'
          : v === values.from_account_id
            ? 'Debe ser otra cuenta'
            : null,
      amount: (v) => (Number(v) > 0 ? null : 'El monto debe ser mayor a cero'),
    },
  });

  const source = accounts.find((a) => a.id === form.values.from_account_id);
  const target = accounts.find((a) => a.id === form.values.to_account_id);
  const crossCurrency = Boolean(source && target && source.currency !== target.currency);

  function handleTargetChange(id: number | null) {
    form.setFieldValue('to_account_id', id);
    // Suggest a helpful description for card payments.
    const account = accounts.find((a) => a.id === id);
    if (account?.type === 'credit_card' && form.values.description === 'Transferencia') {
      form.setFieldValue('description', `Pago ${account.name}`);
    }
  }

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        create.mutate(
          {
            from_account_id: values.from_account_id!,
            to_account_id: values.to_account_id!,
            date: values.date,
            amount: String(values.amount),
            to_amount: crossCurrency && values.to_amount !== '' ? String(values.to_amount) : null,
            description: values.description,
            notes: values.notes || null,
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Mueve dinero entre tus cuentas. Un pago de tarjeta es una transferencia de tu débito a la
          tarjeta; no cuenta como gasto.
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <AccountSelect label="Desde" {...form.getInputProps('from_account_id')} />
          <AccountSelect
            label="Hacia"
            excludeId={form.values.from_account_id}
            {...form.getInputProps('to_account_id')}
            onChange={handleTargetChange}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, xs: crossCurrency ? 3 : 2 }}>
          <DateInput label="Fecha" valueFormat="DD/MM/YYYY" {...form.getInputProps('date')} />
          <NumberInput
            label={crossCurrency ? `Monto enviado (${source?.currency})` : 'Monto'}
            min={0}
            decimalScale={2}
            thousandSeparator=","
            prefix="$"
            {...form.getInputProps('amount')}
          />
          {crossCurrency && (
            <NumberInput
              label={`Monto recibido (${target?.currency})`}
              min={0}
              decimalScale={2}
              thousandSeparator=","
              prefix="$"
              {...form.getInputProps('to_amount')}
            />
          )}
        </SimpleGrid>
        <TextInput label="Descripción" {...form.getInputProps('description')} />
        <Textarea label="Notas" autosize minRows={1} {...form.getInputProps('notes')} />
        <Group justify="flex-end">
          <Button type="submit" loading={create.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

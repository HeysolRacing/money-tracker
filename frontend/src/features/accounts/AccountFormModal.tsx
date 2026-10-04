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
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { ACCOUNT_TYPE_LABELS, BANKS, CURRENCIES, toSelectData } from '../../lib/labels';
import { useSaveAccount } from './api';

type Account = Schemas['AccountOut'];

interface Props {
  opened: boolean;
  onClose: () => void;
  account?: Account;
}

export function AccountFormModal({ opened, onClose, account }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={account ? 'Editar cuenta' : 'Nueva cuenta'}>
      <AccountForm account={account} onDone={onClose} />
    </Modal>
  );
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const save = useSaveAccount();
  const form = useForm({
    initialValues: {
      name: account?.name ?? '',
      bank: account?.bank ?? null,
      type: account?.type ?? 'debit',
      currency: account?.currency ?? 'MXN',
      opening_balance: account?.opening_balance ?? '0',
      credit_limit: account?.credit_limit ?? '',
      statement_day: account?.statement_day ?? '',
      payment_due_day: account?.payment_due_day ?? '',
    } as {
      name: string;
      bank: string | null;
      type: Schemas['AccountType'];
      currency: 'MXN' | 'USD';
      opening_balance: string | number;
      credit_limit: string | number;
      statement_day: string | number;
      payment_due_day: string | number;
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Escribe un nombre'),
    },
  });
  const isCard = form.values.type === 'credit_card';

  function handleSubmit(values: typeof form.values) {
    const optionalNumber = (v: string | number) => (v === '' ? null : Number(v));
    const body: Schemas['AccountCreate'] = {
      name: values.name,
      bank: values.bank,
      type: values.type,
      currency: values.currency,
      opening_balance: String(values.opening_balance || 0),
      credit_limit: isCard && values.credit_limit !== '' ? String(values.credit_limit) : null,
      statement_day: isCard ? optionalNumber(values.statement_day) : null,
      payment_due_day: isCard ? optionalNumber(values.payment_due_day) : null,
    };
    save.mutate({ id: account?.id, body }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <TextInput
          label="Nombre"
          placeholder="BBVA Nómina"
          data-autofocus
          {...form.getInputProps('name')}
        />
        <SimpleGrid cols={2}>
          <Select label="Banco" data={BANKS} searchable clearable {...form.getInputProps('bank')} />
          <Select
            label="Tipo"
            data={toSelectData(ACCOUNT_TYPE_LABELS)}
            allowDeselect={false}
            {...form.getInputProps('type')}
          />
        </SimpleGrid>
        <SimpleGrid cols={2}>
          <Select
            label="Moneda"
            data={[...CURRENCIES]}
            allowDeselect={false}
            {...form.getInputProps('currency')}
          />
          <NumberInput
            label={isCard ? 'Saldo inicial (negativo = deuda)' : 'Saldo inicial'}
            decimalScale={2}
            thousandSeparator=","
            {...form.getInputProps('opening_balance')}
          />
        </SimpleGrid>
        {isCard && (
          <SimpleGrid cols={{ base: 1, xs: 3 }}>
            <NumberInput
              label="Límite de crédito"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('credit_limit')}
            />
            <NumberInput
              label="Día de corte"
              min={1}
              max={31}
              allowDecimal={false}
              {...form.getInputProps('statement_day')}
            />
            <NumberInput
              label="Día límite de pago"
              min={1}
              max={31}
              allowDecimal={false}
              {...form.getInputProps('payment_due_day')}
            />
          </SimpleGrid>
        )}
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

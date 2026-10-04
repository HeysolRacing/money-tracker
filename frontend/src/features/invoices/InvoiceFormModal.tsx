import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import type { Schemas } from '../../api/client';
import { today } from '../../lib/dates';
import { addMoney, formatMoney, ivaOf } from '../../lib/money';
import { useSaveInvoice } from './api';

type Invoice = Schemas['InvoiceOut'];

interface Props {
  opened: boolean;
  onClose: () => void;
  invoice?: Invoice;
}

export function InvoiceFormModal({ opened, onClose, invoice }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={invoice ? 'Editar factura' : 'Nueva factura'}>
      <InvoiceForm invoice={invoice} onDone={onClose} />
    </Modal>
  );
}

function InvoiceForm({ invoice, onDone }: { invoice?: Invoice; onDone: () => void }) {
  const save = useSaveInvoice();
  // I.V.A follows the subtotal (16%) until the user types it by hand.
  const [ivaTouched, setIvaTouched] = useState(Boolean(invoice));
  const form = useForm({
    initialValues: {
      application_date: invoice?.application_date ?? today(),
      concept: invoice?.concept ?? '',
      subtotal: (invoice?.subtotal ?? '') as string | number,
      iva: (invoice?.iva ?? '') as string | number,
      is_invoiced: invoice?.is_invoiced ?? false,
      is_extra: invoice?.is_extra ?? false,
    },
    validate: {
      application_date: (v) => (v ? null : 'Elige una fecha'),
      concept: (v) => (v.trim() ? null : 'Escribe un concepto'),
      subtotal: (v) => (v !== '' && Number(v) >= 0 ? null : 'Escribe el subtotal'),
      iva: (v) => (v !== '' && Number(v) >= 0 ? null : 'Escribe el I.V.A'),
    },
  });

  const { subtotal, iva } = form.values;
  const total = addMoney(subtotal || 0, iva || 0);

  function handleSubtotal(value: string | number) {
    form.setFieldValue('subtotal', value);
    if (!ivaTouched) form.setFieldValue('iva', value === '' ? '' : ivaOf(value));
  }

  function handleSubmit(values: typeof form.values) {
    save.mutate(
      {
        id: invoice?.id,
        body: {
          ...values,
          subtotal: String(values.subtotal),
          iva: String(values.iva),
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <DateInput
          label="Fecha de aplicación"
          valueFormat="DD-MMM-YYYY"
          {...form.getInputProps('application_date')}
        />
        <TextInput label="Concepto" data-autofocus {...form.getInputProps('concept')} />
        {/* One row; no descriptions under labels so the three boxes stay aligned. */}
        <SimpleGrid cols={3} spacing="xs">
          <NumberInput
            label="Subtotal"
            min={0}
            decimalScale={2}
            thousandSeparator=","
            prefix="$"
            hideControls
            {...form.getInputProps('subtotal')}
            onChange={handleSubtotal}
          />
          <NumberInput
            label={ivaTouched ? 'I.V.A' : 'I.V.A (16%)'}
            min={0}
            decimalScale={2}
            thousandSeparator=","
            prefix="$"
            hideControls
            {...form.getInputProps('iva')}
            onChange={(v) => {
              setIvaTouched(true);
              form.setFieldValue('iva', v);
            }}
          />
          <TextInput
            label="Total"
            value={formatMoney(total)}
            readOnly
            tabIndex={-1}
            styles={{ input: { fontWeight: 700 } }}
          />
        </SimpleGrid>
        <Group>
          <Checkbox
            label="Facturado"
            {...form.getInputProps('is_invoiced', { type: 'checkbox' })}
          />
          <Checkbox label="Extra" {...form.getInputProps('is_extra', { type: 'checkbox' })} />
        </Group>
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

import {
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { formatDate, today } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { useSaveTerm } from './api';
import { TERM_PRESETS, termEndDate, termPreview } from './interest';

type Term = Schemas['TermOut'];

const CUSTOM = 'custom';

interface Props {
  opened: boolean;
  onClose: () => void;
  investmentId: number;
  /** Edit this term. */
  term?: Term;
  /** Renew this term: start when it ends, with its amount plus net interest. */
  renewFrom?: Term;
}

export function TermFormModal({ opened, onClose, investmentId, term, renewFrom }: Props) {
  const title = term ? 'Editar plazo' : renewFrom ? 'Renovar plazo' : 'Nuevo plazo';
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <TermForm
        key={term?.id ?? `renew-${renewFrom?.id ?? 'new'}`}
        investmentId={investmentId}
        term={term}
        renewFrom={renewFrom}
        onDone={onClose}
      />
    </Modal>
  );
}

const isPreset = (days: number) => (TERM_PRESETS as readonly number[]).includes(days);

function TermForm({
  investmentId,
  term,
  renewFrom,
  onDone,
}: {
  investmentId: number;
  term?: Term;
  renewFrom?: Term;
  onDone: () => void;
}) {
  const save = useSaveTerm();
  const days = term?.days ?? renewFrom?.days ?? 90;
  const form = useForm({
    initialValues: {
      start_date: term?.start_date ?? renewFrom?.end_date ?? today(),
      preset: isPreset(days) ? String(days) : CUSTOM,
      days: days as string | number,
      amount: (term?.amount ?? renewFrom?.final_amount ?? '') as string | number,
      // A renewal usually comes with a new rate, so it starts empty.
      annual_rate: (term?.annual_rate ?? '') as string | number,
      isr_withheld: (term && Number(term.isr_withheld) > 0 ? term.isr_withheld : '') as
        string | number,
      notes: term?.notes ?? '',
    },
    validate: {
      start_date: (v) => (v ? null : 'Elige una fecha'),
      days: (v) => (Number(v) >= 1 ? null : 'Escribe los días'),
      amount: (v) => (Number(v) > 0 ? null : 'Escribe el monto'),
      annual_rate: (v) => (Number(v) > 0 && Number(v) <= 100 ? null : 'Escribe la tasa anual'),
      isr_withheld: (v, values) =>
        Number(v || 0) >
        Number(
          termPreview(values.amount || 0, values.annual_rate || 0, Number(values.days)).interest,
        )
          ? 'El ISR no puede ser mayor que el interés'
          : null,
    },
  });

  const v = form.values;
  const ready = Number(v.amount) > 0 && Number(v.annual_rate) > 0 && Number(v.days) > 0;
  const preview = ready
    ? termPreview(v.amount, v.annual_rate, Number(v.days), v.isr_withheld || 0)
    : null;

  function handleSubmit(values: typeof form.values) {
    save.mutate(
      {
        id: term?.id,
        investmentId,
        body: {
          start_date: values.start_date,
          days: Number(values.days),
          amount: String(values.amount),
          annual_rate: String(values.annual_rate),
          isr_withheld: String(values.isr_withheld || 0),
          notes: values.notes.trim() || null,
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
        <DateInput
          label="Fecha de inicio"
          valueFormat="DD/MM/YYYY"
          {...form.getInputProps('start_date')}
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Plazo
          </Text>
          <SegmentedControl
            aria-label="Plazo"
            data={[
              ...TERM_PRESETS.map((d) => ({ value: String(d), label: `${d} días` })),
              { value: CUSTOM, label: 'Otro' },
            ]}
            value={v.preset}
            onChange={(preset) => {
              form.setFieldValue('preset', preset);
              if (preset !== CUSTOM) form.setFieldValue('days', Number(preset));
            }}
          />
          {v.preset === CUSTOM && (
            <NumberInput
              aria-label="Días"
              placeholder="Días"
              min={1}
              max={3650}
              allowDecimal={false}
              suffix=" días"
              {...form.getInputProps('days')}
            />
          )}
        </Stack>
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput label="Monto" data-autofocus {...money} {...form.getInputProps('amount')} />
          <NumberInput
            label="Tasa anual"
            min={0}
            max={100}
            decimalScale={4}
            suffix="%"
            hideControls
            {...form.getInputProps('annual_rate')}
          />
        </SimpleGrid>
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput
            label="ISR retenido"
            description="Opcional"
            {...money}
            {...form.getInputProps('isr_withheld')}
          />
          <TextInput label="Notas" description="Opcional" {...form.getInputProps('notes')} />
        </SimpleGrid>

        <Card withBorder radius="md" padding="sm" bg="var(--mantine-color-default-hover)">
          {preview ? (
            <SimpleGrid cols={2} spacing={4} verticalSpacing={4}>
              <Text size="sm" c="dimmed">
                Vence
              </Text>
              <Text size="sm" ta="right">
                {formatDate(termEndDate(v.start_date, Number(v.days)))}
              </Text>
              <Text size="sm" c="dimmed">
                Interés ({v.annual_rate}% anual, {v.days} días)
              </Text>
              <Text size="sm" ta="right">
                {formatMoney(preview.interest)}
              </Text>
              <Text size="sm" c="dimmed">
                Interés neto de ISR
              </Text>
              <Text size="sm" ta="right">
                {formatMoney(preview.net)}
              </Text>
              <Text size="sm" fw={700}>
                Monto al vencimiento
              </Text>
              <Text size="sm" fw={700} ta="right">
                {formatMoney(preview.final)}
              </Text>
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed">
              Escribe monto, tasa y plazo para ver el interés. Se calcula con tasa anual sobre 360
              días: monto × tasa × días / 360.
            </Text>
          )}
        </Card>

        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

import { Button, Group, Modal, SegmentedControl, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { useSaveInvestment } from './api';

type Investment = Schemas['InvestmentOut'];
type InvestmentGroup = Schemas['InvestmentGroup'];

export const GROUP_LABELS: Record<InvestmentGroup, string> = {
  main: 'Inversión',
  occasional: 'Ocasional',
};

interface Props {
  opened: boolean;
  onClose: () => void;
  investment?: Investment;
}

export function InvestmentFormModal({ opened, onClose, investment }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={investment ? 'Editar inversión' : 'Nueva inversión'}
    >
      <InvestmentForm key={investment?.id ?? 'new'} investment={investment} onDone={onClose} />
    </Modal>
  );
}

function InvestmentForm({ investment, onDone }: { investment?: Investment; onDone: () => void }) {
  const save = useSaveInvestment();
  const form = useForm({
    initialValues: {
      name: investment?.name ?? '',
      group: (investment?.group ?? 'main') as InvestmentGroup,
    },
    validate: { name: (v) => (v.trim() ? null : 'Escribe un nombre') },
  });

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate({ id: investment?.id, body: values }, { onSuccess: onDone }),
      )}
    >
      <Stack>
        <TextInput
          label="Nombre"
          placeholder="OPENBANK, MIFEL, CETES…"
          data-autofocus
          {...form.getInputProps('name')}
        />
        <SegmentedControl
          aria-label="Grupo"
          data={[
            { value: 'main', label: GROUP_LABELS.main },
            { value: 'occasional', label: GROUP_LABELS.occasional },
          ]}
          {...form.getInputProps('group')}
        />
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

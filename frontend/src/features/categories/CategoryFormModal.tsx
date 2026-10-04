import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { Schemas } from '../../api/client';
import { useCategories, useSaveCategory } from './api';

type Category = Schemas['CategoryOut'];

interface Props {
  opened: boolean;
  onClose: () => void;
  kind: Schemas['CategoryKind'];
  category?: Category;
}

export function CategoryFormModal({ opened, onClose, kind, category }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        category
          ? 'Editar categoría'
          : kind === 'expense'
            ? 'Nueva categoría de gasto'
            : 'Nueva categoría de ingreso'
      }
    >
      <CategoryForm kind={kind} category={category} onDone={onClose} />
    </Modal>
  );
}

function CategoryForm({
  kind,
  category,
  onDone,
}: Omit<Props, 'opened' | 'onClose'> & { onDone: () => void }) {
  const { data: categories = [] } = useCategories();
  const save = useSaveCategory();
  const hasChildren = category ? categories.some((c) => c.parent_id === category.id) : false;
  const parents = categories.filter(
    (c) => c.kind === kind && c.parent_id === null && c.id !== category?.id,
  );

  const form = useForm({
    initialValues: {
      name: category?.name ?? '',
      parent_id: category?.parent_id ? String(category.parent_id) : null,
    },
    validate: { name: (v) => (v.trim() ? null : 'Escribe un nombre') },
  });

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate(
          {
            id: category?.id,
            body: {
              name: values.name,
              kind,
              parent_id: values.parent_id ? Number(values.parent_id) : null,
            },
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <Stack>
        <TextInput label="Nombre" data-autofocus {...form.getInputProps('name')} />
        <Select
          label="Categoría padre (opcional)"
          data={parents.map((p) => ({ value: String(p.id), label: p.name }))}
          clearable
          searchable
          disabled={hasChildren}
          description={hasChildren ? 'Tiene subcategorías, no puede tener padre' : undefined}
          {...form.getInputProps('parent_id')}
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

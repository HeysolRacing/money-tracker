import { ActionIcon, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { Schemas } from '../api/client';
import { useCategories, useDeleteCategory } from '../features/categories/api';
import { CategoryFormModal } from '../features/categories/CategoryFormModal';

type Category = Schemas['CategoryOut'];
type Kind = Schemas['CategoryKind'];

export function CategoriesPage() {
  const [form, setForm] = useState<{ kind: Kind; category?: Category } | null>(null);

  return (
    <Stack>
      <Title order={2}>Categorías</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <CategoryColumn kind="expense" title="Gastos" onOpen={setForm} />
        <CategoryColumn kind="income" title="Ingresos" onOpen={setForm} />
      </SimpleGrid>
      <CategoryFormModal
        opened={form !== null}
        onClose={() => setForm(null)}
        kind={form?.kind ?? 'expense'}
        category={form?.category}
      />
    </Stack>
  );
}

function CategoryColumn({
  kind,
  title,
  onOpen,
}: {
  kind: Kind;
  title: string;
  onOpen: (form: { kind: Kind; category?: Category }) => void;
}) {
  const { data: categories = [] } = useCategories();
  const remove = useDeleteCategory();
  const ofKind = categories.filter((c) => c.kind === kind);
  const parents = ofKind.filter((c) => c.parent_id === null);

  function confirmDelete(category: Category) {
    modals.openConfirmModal({
      title: 'Eliminar categoría',
      children: (
        <Text size="sm">
          ¿Eliminar «{category.name}»? Los movimientos con esta categoría quedarán sin categoría.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(category.id),
    });
  }

  const row = (category: Category, child: boolean) => (
    <Group key={category.id} justify="space-between" pl={child ? 'lg' : 0} wrap="nowrap">
      <Text size="sm" fw={child ? 400 : 600} c={child ? undefined : 'bright'}>
        {category.name}
      </Text>
      <Group gap={4} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Editar"
          onClick={() => onOpen({ kind, category })}
        >
          <IconPencil size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Eliminar"
          onClick={() => confirmDelete(category)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => onOpen({ kind })}
        >
          Agregar
        </Button>
      </Group>
      <Stack gap={4}>
        {parents.map((parent) => [
          row(parent, false),
          ...ofKind.filter((c) => c.parent_id === parent.id).map((c) => row(c, true)),
        ])}
      </Stack>
    </Card>
  );
}

import { Select, type SelectProps } from '@mantine/core';
import { useMemo } from 'react';
import type { Schemas } from '../../api/client';
import { useCategories } from './api';

interface Props extends Omit<SelectProps, 'data' | 'value' | 'onChange'> {
  kind?: Schemas['CategoryKind'];
  value?: number | null;
  onChange: (value: number | null) => void;
}

/** Categories grouped by parent: "Alimentación" group lists itself and its subcategories. */
export function CategorySelect({ kind, value, onChange, ...props }: Props) {
  const { data: categories = [] } = useCategories();

  const data = useMemo(() => {
    const relevant = categories.filter((c) => !kind || c.kind === kind);
    return relevant
      .filter((c) => c.parent_id === null)
      .map((parent) => ({
        group: parent.name,
        items: [
          { value: String(parent.id), label: parent.name },
          ...relevant
            .filter((c) => c.parent_id === parent.id)
            .map((c) => ({ value: String(c.id), label: c.name })),
        ],
      }));
  }, [categories, kind]);

  return (
    <Select
      searchable
      clearable
      nothingFoundMessage="Sin resultados"
      {...props}
      data={data}
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v ? Number(v) : null)}
    />
  );
}

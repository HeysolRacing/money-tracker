import { Select, type SelectProps } from '@mantine/core';
import { useAccounts } from './api';

interface Props extends Omit<SelectProps, 'data' | 'value' | 'onChange'> {
  value?: number | null;
  onChange: (value: number | null) => void;
  /** Hide an account (e.g. the source account when choosing a transfer destination). */
  excludeId?: number | null;
}

export function AccountSelect({ value, onChange, excludeId, ...props }: Props) {
  const { data: accounts = [] } = useAccounts();
  const data = accounts
    .filter((a) => a.id !== excludeId)
    .map((a) => ({
      value: String(a.id),
      label: a.currency === 'MXN' ? a.name : `${a.name} (${a.currency})`,
    }));

  return (
    <Select
      searchable
      nothingFoundMessage="Sin cuentas"
      {...props}
      data={data}
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v ? Number(v) : null)}
    />
  );
}

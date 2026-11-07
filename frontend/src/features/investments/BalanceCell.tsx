import { NumberInput, Table, Text, UnstyledButton } from '@mantine/core';
import { useRef, useState } from 'react';
import { formatMoney } from '../../lib/money';
import { useSetBalance } from './api';
import { MONTHS } from './interest';

interface Props {
  investmentId: number;
  name: string;
  year: number;
  month: number; // 1-12
  value: string | null;
}

/**
 * One month's balance, edited in place: click, type, Enter (or leave the cell) to save,
 * Escape to cancel. Emptying the cell clears it; 0 is kept and shown as "$0.00".
 */
export function BalanceCell({ investmentId, name, year, month, value }: Props) {
  const save = useSetBalance();
  const [draft, setDraft] = useState<string | number | null>(null);
  // Enter and Escape end editing; the blur that follows must not save again.
  const ended = useRef(false);

  function startEditing() {
    ended.current = false;
    setDraft(value ?? '');
  }

  function commit() {
    if (draft === null || ended.current) return;
    ended.current = true;
    const amount = draft === '' ? null : String(draft);
    setDraft(null);
    const unchanged =
      amount === null ? value === null : value !== null && Number(amount) === Number(value);
    if (!unchanged) save.mutate({ investmentId, year, month, amount });
  }

  if (draft !== null) {
    return (
      <Table.Td p={2}>
        <NumberInput
          aria-label={`${name}, ${MONTHS[month - 1]}`}
          size="xs"
          autoFocus
          min={0}
          decimalScale={2}
          thousandSeparator=","
          hideControls
          value={draft}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              ended.current = true;
              setDraft(null);
            }
          }}
          styles={{ input: { textAlign: 'right', minWidth: 96 } }}
        />
      </Table.Td>
    );
  }

  return (
    <Table.Td ta="right" p={0}>
      <UnstyledButton
        aria-label={`Editar ${name}, ${MONTHS[month - 1]}`}
        onClick={startEditing}
        w="100%"
        px="xs"
        py={6}
        style={{ textAlign: 'right', opacity: save.isPending ? 0.5 : 1, whiteSpace: 'nowrap' }}
      >
        {value === null ? (
          <Text span size="sm">
            &nbsp;
          </Text>
        ) : Number(value) === 0 ? (
          <Text span size="sm" c="dimmed">
            {formatMoney(0)}
          </Text>
        ) : (
          <Text span size="sm">
            {formatMoney(value)}
          </Text>
        )}
      </UnstyledButton>
    </Table.Td>
  );
}

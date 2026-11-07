import { Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Schemas } from '../../api/client';
import { formatMoney } from '../../lib/money';
import { formatPercent, MONTHS, percentChange } from './interest';

type Summary = Schemas['GridSummary'];

/** Header summary: current total and its change, then interest from terms (plazos). */
export function InvestmentSummaryCards({ summary }: { summary?: Summary }) {
  const s = summary;
  const month = s?.as_of_month ? MONTHS[s.as_of_month - 1] : null;
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Stat
          label={month ? `Total (${month})` : 'Total'}
          value={s?.current_total != null ? formatMoney(s.current_total) : '—'}
          strong
        />
        <Change
          label="Cambio mensual"
          change={s?.monthly_change}
          base={s?.previous_total}
          hint="vs. el mes anterior con datos"
        />
        <Change
          label="Crecimiento en el año"
          change={s?.year_change}
          base={s?.first_total}
          hint="vs. el primer mes del año"
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Breakdown
          label="En plazos"
          color="blue"
          value={s?.active_principal ?? '0'}
          hint={`${s?.active_terms ?? 0} ${s?.active_terms === 1 ? 'plazo vigente' : 'plazos vigentes'}`}
        />
        <Breakdown
          label="Interés por cobrar"
          color="orange"
          value={s?.expected_interest ?? '0'}
          hint="Neto de ISR, al vencer los plazos vigentes"
        />
        <Breakdown
          label="Interés ganado"
          color="teal"
          value={s?.interest_earned ?? '0'}
          hint="Neto de ISR, plazos vencidos este año"
        />
      </SimpleGrid>
    </Stack>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card withBorder radius="md" padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={strong ? 800 : 700}>
        {value}
      </Text>
    </Card>
  );
}

function Change({
  label,
  change,
  base,
  hint,
}: {
  label: string;
  change?: string | null;
  base?: string | null;
  hint: string;
}) {
  const pct = percentChange(change, base);
  const sign = change == null ? 0 : Math.sign(Number(change));
  return (
    <Card withBorder radius="md" padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Group gap="xs" align="baseline">
        <Text size="xl" fw={700}>
          {change != null ? `${sign > 0 ? '+' : ''}${formatMoney(change)}` : '—'}
        </Text>
        {pct !== null && (
          <Text size="sm" fw={600} c={sign > 0 ? 'teal' : sign < 0 ? 'red' : 'dimmed'}>
            {sign > 0 ? '▲' : sign < 0 ? '▼' : ''} {formatPercent(pct)}
          </Text>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Card>
  );
}

function Breakdown({
  label,
  color,
  value,
  hint,
}: {
  label: string;
  color: string;
  value: string;
  hint: string;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
    >
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Text size="lg" fw={700}>
        {formatMoney(value)}
      </Text>
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Card>
  );
}

import { Card, SimpleGrid, Text } from '@mantine/core';
import type { Schemas } from '../../api/client';
import { formatMoney } from '../../lib/money';

type Totals = Schemas['LoanTotals'];

const EMPTY: Totals = { count: 0, lent: '0', paid: '0', balance: '0', revenue: '0' };

/** Header summary: Prestado, Pagado, Saldo pendiente and Ganancia. */
export function LoanSummaryCards({ totals }: { totals?: Totals }) {
  const t = totals ?? EMPTY;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }}>
      <Stat label="Prestado" value={t.lent} />
      <Stat label="Pagado" value={t.paid} />
      <Stat label="Saldo pendiente" value={t.balance} color="orange" />
      <Stat label="Ganancia" value={t.revenue} color="teal" />
    </SimpleGrid>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      style={color ? { borderLeft: `4px solid var(--mantine-color-${color}-6)` } : undefined}
    >
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} c={color}>
        {formatMoney(value)}
      </Text>
    </Card>
  );
}

import { Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Schemas } from '../../api/client';
import { formatMoney } from '../../lib/money';

type Summary = Schemas['InvoiceSummary'];
type Amounts = Schemas['AmountSummary'];

/** Header summary: overall totals, then Facturado / Por facturar / Extra. */
export function InvoiceSummaryCards({ summary }: { summary?: Summary }) {
  const empty: Amounts = { count: 0, subtotal: '0', iva: '0', total: '0' };
  const s = summary ?? { all: empty, invoiced: empty, pending: empty, extra: empty };

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="Facturas" value={String(s.all.count)} />
        <Stat label="Subtotal" value={formatMoney(s.all.subtotal)} />
        <Stat label="I.V.A" value={formatMoney(s.all.iva)} />
        <Stat label="Total" value={formatMoney(s.all.total)} strong />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Breakdown label="Facturado" color="teal" amounts={s.invoiced} />
        <Breakdown label="Por facturar" color="orange" amounts={s.pending} />
        <Breakdown label="Extra" color="grape" amounts={s.extra} />
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

function Breakdown({ label, color, amounts }: { label: string; color: string; amounts: Amounts }) {
  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
    >
      <Group justify="space-between" align="baseline">
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {amounts.count} {amounts.count === 1 ? 'factura' : 'facturas'}
        </Text>
      </Group>
      <Text size="lg" fw={700} c={color}>
        {formatMoney(amounts.total)}
      </Text>
      <Text size="xs" c="dimmed">
        Subtotal {formatMoney(amounts.subtotal)} · I.V.A {formatMoney(amounts.iva)}
      </Text>
    </Card>
  );
}

import { LineChart } from '@mantine/charts';
import { Badge, Card, Group, SimpleGrid, Stack, Switch, Table, Text, Title } from '@mantine/core';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { Schemas } from '../../api/client';
import { SortableTh } from '../../components/SortableTh';
import { formatDate } from '../../lib/dates';
import { formatMoney, fromCents, toCents } from '../../lib/money';
import { sortItems, toggleSort, type SortState } from '../../lib/sort';
import { useInvestmentDashboard } from './api';
import { GROUP_LABELS } from './InvestmentFormModal';
import { formatPercent, MONTHS, percentChange } from './interest';

type Dashboard = Schemas['Dashboard'];

// One entity (the total), so one hue: the theme's primary color. Forecast is the same
// line, dashed.
const LINE_COLOR = 'var(--mantine-primary-color-filled)';

const compact = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${String(year).slice(2)}`;

export function InvestmentsDashboard() {
  const { data } = useInvestmentDashboard();
  if (!data) return null;
  if (data.history.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Captura saldos mensuales en la pestaña «Saldos» para ver el crecimiento y el pronóstico.
      </Text>
    );
  }
  return (
    <Stack>
      <Tiles data={data} />
      <GrowthChart data={data} />
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Maturities items={data.maturities} />
        <GrowthByInvestment items={data.growth} />
      </SimpleGrid>
    </Stack>
  );
}

function Tiles({ data }: { data: Dashboard }) {
  const last = data.history[data.history.length - 1]!;
  const { trend, terms_projection: p } = data;
  const termsGain = toCents(p.projected_value) - toCents(p.principal);
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
      <Tile
        label={`Total (${monthLabel(last.year, last.month)})`}
        value={formatMoney(last.total)}
        hint={`Inversiones ${formatMoney(last.main)} · Ocasionales ${formatMoney(last.occasional)}`}
      />
      <Tile
        label="Crecimiento promedio"
        value={
          trend
            ? `${Number(trend.monthly_growth) > 0 ? '+' : ''}${formatMoney(trend.monthly_growth)}`
            : '—'
        }
        hint={
          trend
            ? `por mes, tendencia de los últimos ${trend.months_used} meses`
            : 'Se necesitan al menos dos meses'
        }
      />
      <Tile
        label="Proyección a diciembre"
        value={trend?.projected_year_end ? formatMoney(trend.projected_year_end) : '—'}
        hint="Si sigue la tendencia"
      />
      <Tile
        label="Plazos en 12 meses"
        value={toCents(p.principal) ? formatMoney(p.projected_value) : '—'}
        hint={
          toCents(p.principal)
            ? `Desde ${formatMoney(p.principal)} (+${formatMoney(fromCents(termsGain))}), renovando a la misma tasa`
            : 'Sin plazos vigentes'
        }
      />
    </SimpleGrid>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card withBorder radius="md" padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
    </Card>
  );
}

function GrowthChart({ data }: { data: Dashboard }) {
  const [asTable, setAsTable] = useState(false);
  const rows = useMemo(() => {
    const history = data.history.map((p) => ({
      label: monthLabel(p.year, p.month),
      real: Number(p.total) as number | null,
      pronostico: null as number | null,
    }));
    // The forecast starts at the last real point so the dashed line continues the solid one.
    const last = history[history.length - 1];
    if (last && data.forecast.length) last.pronostico = last.real;
    return [
      ...history,
      ...data.forecast.map((f) => ({
        label: monthLabel(f.year, f.month),
        real: null,
        pronostico: Number(f.total),
      })),
    ];
  }, [data]);

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="sm">
        <div>
          <Title order={4}>Crecimiento y pronóstico</Title>
          <Text size="xs" c="dimmed">
            Total mensual (inversiones + ocasionales). El pronóstico extiende la tendencia lineal{' '}
            {data.forecast.length} meses.
          </Text>
        </div>
        <Switch
          label="Ver datos"
          checked={asTable}
          onChange={(e) => setAsTable(e.currentTarget.checked)}
        />
      </Group>
      {asTable ? (
        <Table.ScrollContainer minWidth={360} maxHeight={320}>
          <Table striped stickyHeader verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mes</Table.Th>
                <Table.Th ta="right">Real</Table.Th>
                <Table.Th ta="right">Pronóstico</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.history.map((p) => (
                <Table.Tr key={`h-${p.year}-${p.month}`}>
                  <Table.Td>{monthLabel(p.year, p.month)}</Table.Td>
                  <Table.Td ta="right">{formatMoney(p.total)}</Table.Td>
                  <Table.Td />
                </Table.Tr>
              ))}
              {data.forecast.map((f) => (
                <Table.Tr key={`f-${f.year}-${f.month}`}>
                  <Table.Td>{monthLabel(f.year, f.month)}</Table.Td>
                  <Table.Td />
                  <Table.Td ta="right">{formatMoney(f.total)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <LineChart
          h={300}
          data={rows}
          dataKey="label"
          series={[
            { name: 'real', label: 'Real', color: LINE_COLOR },
            { name: 'pronostico', label: 'Pronóstico', color: LINE_COLOR, strokeDasharray: '6 4' },
          ]}
          curveType="linear"
          strokeWidth={2}
          dotProps={{ r: 4, strokeWidth: 2 }}
          activeDotProps={{ r: 5, strokeWidth: 2 }}
          gridAxis="y"
          withLegend
          legendProps={{ verticalAlign: 'top', height: 32 }}
          valueFormatter={(v) => formatMoney(v)}
          yAxisProps={{ tickFormatter: (v: number) => compact.format(v), width: 72 }}
          connectNulls={false}
        />
      )}
    </Card>
  );
}

type Maturity = Schemas['Maturity'];
type MaturityKey = 'end_date' | 'investment_name' | 'final_amount' | 'net_interest' | 'annual_rate';

function Maturities({ items }: { items: Maturity[] }) {
  const [sort, setSort] = useState<SortState<MaturityKey>>({ key: 'end_date', order: 'asc' });
  const th = { sort, onSort: (key: MaturityKey) => setSort((s) => toggleSort(s, key)) };
  const sorted = useMemo(
    () =>
      sortItems(items, sort, (m, key) =>
        key === 'end_date' || key === 'investment_name'
          ? m[key]
          : key === 'annual_rate'
            ? Number(m.annual_rate)
            : toCents(m[key]),
      ),
    [items, sort],
  );
  return (
    <Card withBorder radius="md" padding="md">
      <Title order={4} mb="sm">
        Próximos vencimientos
      </Title>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay plazos vigentes. Agrégalos desde «Detalles» en la tabla de saldos.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={520}>
          <Table striped verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <SortableTh sortKey="end_date" {...th}>
                  Vence
                </SortableTh>
                <SortableTh sortKey="investment_name" {...th}>
                  Inversión
                </SortableTh>
                <SortableTh sortKey="annual_rate" ta="right" {...th}>
                  Tasa
                </SortableTh>
                <SortableTh sortKey="net_interest" ta="right" {...th}>
                  Interés neto
                </SortableTh>
                <SortableTh sortKey="final_amount" ta="right" {...th}>
                  Monto final
                </SortableTh>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((m) => (
                <Table.Tr key={m.term_id}>
                  <Table.Td>
                    <Text size="sm">{formatDate(m.end_date)}</Text>
                    <Text size="xs" c="dimmed">
                      {m.days_left > 0
                        ? `en ${m.days_left} ${m.days_left === 1 ? 'día' : 'días'}`
                        : dayjs(m.end_date).isSame(dayjs(), 'day')
                          ? 'hoy'
                          : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>{m.investment_name}</Table.Td>
                  <Table.Td ta="right">{m.annual_rate}%</Table.Td>
                  <Table.Td ta="right">{formatMoney(m.net_interest)}</Table.Td>
                  <Table.Td ta="right" fw={700}>
                    {formatMoney(m.final_amount)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

type Growth = Schemas['InvestmentGrowth'];
type GrowthKey = 'name' | 'first' | 'latest' | 'change' | 'pct';

function GrowthByInvestment({ items }: { items: Growth[] }) {
  const [sort, setSort] = useState<SortState<GrowthKey>>({ key: 'latest', order: 'desc' });
  const th = { sort, onSort: (key: GrowthKey) => setSort((s) => toggleSort(s, key)) };
  const withData = useMemo(() => items.filter((g) => g.latest != null), [items]);
  const sorted = useMemo(
    () =>
      sortItems(withData, sort, (g, key) => {
        if (key === 'name') return g.name;
        if (key === 'pct') return percentChange(g.change, g.first);
        const value = g[key];
        return value == null ? null : toCents(value);
      }),
    [withData, sort],
  );
  return (
    <Card withBorder radius="md" padding="md">
      <Title order={4}>Crecimiento por inversión</Title>
      <Text size="xs" c="dimmed" mb="sm">
        Del primer al último mes con saldo de {dayjs().year()}.
      </Text>
      {withData.length === 0 ? (
        <Text size="sm" c="dimmed">
          Sin saldos este año.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={520} maxHeight={420}>
          <Table striped stickyHeader verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <SortableTh sortKey="name" {...th}>
                  Inversión
                </SortableTh>
                <SortableTh sortKey="first" ta="right" {...th}>
                  Inicio
                </SortableTh>
                <SortableTh sortKey="latest" ta="right" {...th}>
                  Actual
                </SortableTh>
                <SortableTh sortKey="change" ta="right" {...th}>
                  Cambio
                </SortableTh>
                <SortableTh sortKey="pct" ta="right" {...th}>
                  %
                </SortableTh>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((g) => {
                const pct = percentChange(g.change, g.first);
                const sign = Math.sign(Number(g.change ?? 0));
                return (
                  <Table.Tr key={g.id}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">{g.name}</Text>
                        {g.group === 'occasional' && (
                          <Badge size="xs" variant="light" color="gray">
                            {GROUP_LABELS.occasional}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">{g.first != null ? formatMoney(g.first) : ''}</Table.Td>
                    <Table.Td ta="right">{g.latest != null ? formatMoney(g.latest) : ''}</Table.Td>
                    <Table.Td ta="right">
                      {g.change != null ? `${sign > 0 ? '+' : ''}${formatMoney(g.change)}` : ''}
                    </Table.Td>
                    <Table.Td ta="right">
                      {pct !== null && (
                        <Text
                          span
                          size="sm"
                          fw={600}
                          c={sign > 0 ? 'teal' : sign < 0 ? 'red' : 'dimmed'}
                        >
                          {sign > 0 ? '▲' : sign < 0 ? '▼' : ''} {formatPercent(pct)}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

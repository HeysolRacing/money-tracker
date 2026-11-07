import { Button, Group, Select, Stack, Tabs, Text, Title } from '@mantine/core';
import { IconChartLine, IconPlus, IconTable } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Schemas } from '../api/client';
import { useInvestmentGrid } from '../features/investments/api';
import { InvestmentFormModal } from '../features/investments/InvestmentFormModal';
import { InvestmentsDashboard } from '../features/investments/InvestmentsDashboard';
import { InvestmentsGrid } from '../features/investments/InvestmentsGrid';
import { InvestmentSummaryCards } from '../features/investments/InvestmentSummaryCards';
import { TermsModal } from '../features/investments/TermsModal';

type Row = Schemas['InvestmentRow'];

const BALANCES = 'saldos';
const DASHBOARD = 'dashboard';

export function InvestmentsPage() {
  // The tab lives in the URL so the dashboard can be linked and survives a reload.
  const [params, setParams] = useSearchParams();
  const tab = params.get('vista') === DASHBOARD ? DASHBOARD : BALANCES;
  const [year, setYear] = useState(dayjs().year());
  const [editing, setEditing] = useState<Row | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<Row | undefined>();

  const { data } = useInvestmentGrid(year);

  function openForm(row?: Row) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Inversiones</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => openForm()}>
          Nueva inversión
        </Button>
      </Group>

      <Tabs
        value={tab}
        onChange={(v) => setParams(v === DASHBOARD ? { vista: DASHBOARD } : {}, { replace: true })}
      >
        <Tabs.List>
          <Tabs.Tab value={BALANCES} leftSection={<IconTable size={16} />}>
            Saldos
          </Tabs.Tab>
          <Tabs.Tab value={DASHBOARD} leftSection={<IconChartLine size={16} />}>
            Dashboard
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {tab === DASHBOARD ? (
        <InvestmentsDashboard />
      ) : (
        <>
          <Group justify="space-between" align="flex-end">
            <Select
              label="Año"
              w={120}
              data={(data?.years ?? [year]).map(String)}
              value={String(year)}
              onChange={(v) => v && setYear(Number(v))}
              allowDeselect={false}
            />
            <Text size="xs" c="dimmed">
              Haz clic en una celda para capturar el saldo del mes. Enter guarda, Esc cancela; vacía
              la celda para borrarla.
            </Text>
          </Group>

          <InvestmentSummaryCards summary={data?.summary} />

          {data && data.items.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              Agrega tu primera inversión con «Nueva inversión».
            </Text>
          ) : (
            data && <InvestmentsGrid grid={data} onEdit={openForm} onDetails={setDetails} />
          )}
        </>
      )}

      <InvestmentFormModal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        investment={editing}
      />
      <TermsModal investment={details} onClose={() => setDetails(undefined)} />
    </Stack>
  );
}

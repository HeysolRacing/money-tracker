import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconFileTypePdf, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { Schemas } from '../../api/client';
import { formatDate } from '../../lib/dates';
import { STATEMENT_ROW_KIND_LABELS } from '../../lib/labels';
import { addMoney, formatMoney } from '../../lib/money';
import { useAccounts } from '../accounts/api';
import { AccountSelect } from '../accounts/AccountSelect';
import { CategorySelect } from '../categories/CategorySelect';
import {
  useDeleteStatementImport,
  useImportStatement,
  usePreviewStatement,
  useStatementImports,
} from './api';

type Preview = Schemas['StatementPreview'];
type PreviewRow = Schemas['StatementPreviewRow'];
type RowKind = Schemas['RowKind'];

/** What the user can change on each row before uploading. */
interface RowEdit {
  selected: boolean;
  kind: RowKind;
  category_id: number | null;
  counterpart_account_id: number | null;
}

const KIND_COLORS: Record<RowKind, string> = {
  expense: 'red',
  income: 'teal',
  payment: 'blue',
  transfer_out: 'gray',
  transfer_in: 'gray',
};

const OUTFLOW_KINDS: RowKind[] = ['expense', 'transfer_out'];
const isOutflow = (kind: RowKind) => OUTFLOW_KINDS.includes(kind);
const isTransfer = (kind: RowKind) => kind === 'transfer_out' || kind === 'transfer_in';

/** A row keeps its direction: an outflow is an expense or a transfer out, and so on. */
function kindOptions(row: PreviewRow) {
  return isOutflow(row.kind)
    ? [
        { value: 'expense', label: 'Gasto' },
        { value: 'transfer_out', label: 'Transferencia' },
      ]
    : [
        { value: 'income', label: 'Ingreso' },
        { value: 'transfer_in', label: 'Transferencia' },
      ];
}

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Preselected when it supports bulk import (e.g. the account filter of Movimientos). */
  defaultAccountId?: number | null;
}

export function StatementImportModal({ opened, onClose, defaultAccountId }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Carga masiva de estado de cuenta" size="90%">
      <StatementImport defaultAccountId={defaultAccountId} onDone={onClose} />
    </Modal>
  );
}

function StatementImport({
  defaultAccountId,
  onDone,
}: {
  defaultAccountId?: number | null;
  onDone: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const importable = accounts.filter((a) => a.statement_format);
  const [accountId, setAccountId] = useState<number | null>(
    importable.some((a) => a.id === defaultAccountId) ? defaultAccountId! : null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [edits, setEdits] = useState<RowEdit[]>([]);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const read = usePreviewStatement();
  const save = useImportStatement();

  const account = accounts.find((a) => a.id === accountId);

  function readPdf(nextAccountId: number | null, nextFile: File | null) {
    setPreview(null);
    read.reset();
    if (!nextAccountId || !nextFile) return;
    read.mutate(
      { accountId: nextAccountId, file: nextFile },
      {
        onSuccess: (data) => {
          setPreview(data);
          setEdits(
            data.rows.map((r) => ({
              selected: !r.skip_reason,
              kind: r.kind,
              category_id: null,
              counterpart_account_id: null,
            })),
          );
        },
      },
    );
  }

  function edit(index: number, changes: Partial<RowEdit>) {
    setEdits((prev) => prev.map((e, i) => (i === index ? { ...e, ...changes } : e)));
  }

  const rows = preview?.rows ?? [];
  const chosen = edits.filter((e) => e.selected);
  const needsSource = chosen.some((e) => e.kind === 'payment');
  const missingCounterpart = chosen.some(
    (e) => isTransfer(e.kind) && e.counterpart_account_id === null,
  );
  const net = addMoney(
    ...rows
      .filter((_, i) => edits[i]?.selected)
      .map((r) => (isOutflow(r.kind) ? `-${r.amount}` : r.amount)),
  );
  const canSave = chosen.length > 0 && (!needsSource || sourceId !== null) && !missingCounterpart;

  function upload() {
    if (!preview || !accountId) return;
    save.mutate(
      {
        account_id: accountId,
        period_start: preview.period_start,
        period_end: preview.period_end,
        file_sha256: preview.file_sha256,
        payment_source_account_id: needsSource ? sourceId : null,
        rows: rows.flatMap((r, i) => {
          const e = edits[i];
          if (!e?.selected) return [];
          const transfer = e.kind === 'payment' || isTransfer(e.kind);
          return [
            {
              date: r.date,
              description: r.description,
              amount: r.amount,
              card_ending: r.card_ending,
              notes: r.notes,
              kind: e.kind,
              category_id: transfer ? null : e.category_id,
              counterpart_account_id: isTransfer(e.kind) ? e.counterpart_account_id : null,
            },
          ];
        }),
      },
      {
        onSuccess: ({ created }) => {
          notifications.show({ color: 'teal', message: `Se cargaron ${created} movimientos` });
          onDone();
        },
      },
    );
  }

  return (
    <Stack>
      {importable.length === 0 && (
        <Alert color="yellow">
          Ninguna cuenta tiene la carga masiva activada. Configúrala al editar la cuenta.
        </Alert>
      )}
      <Group grow align="flex-end">
        <Select
          label="Cuenta"
          placeholder="Elige la cuenta"
          data={importable.map((a) => ({ value: String(a.id), label: a.name }))}
          value={accountId === null ? null : String(accountId)}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            setAccountId(id);
            readPdf(id, file);
          }}
        />
        <FileInput
          label="Estado de cuenta (PDF)"
          placeholder="Selecciona el PDF"
          accept="application/pdf"
          leftSection={<IconFileTypePdf size={16} />}
          clearable
          value={file}
          onChange={(f) => {
            setFile(f);
            readPdf(accountId, f);
          }}
        />
      </Group>

      {read.isPending && <Text c="dimmed">Leyendo el PDF…</Text>}
      {read.error && <Alert color="red">{read.error.message}</Alert>}

      {accountId !== null && !preview && <PreviousLoads accountId={accountId} />}

      {preview && (
        <>
          <Group justify="space-between">
            <Text>
              Periodo: <b>{formatDate(preview.period_start)}</b> al{' '}
              <b>{formatDate(preview.period_end)}</b> · Terminación ***{preview.card_ending}
            </Text>
            <Text fw={600}>Transacciones detectadas: {rows.length}</Text>
          </Group>

          {preview.warnings.length > 0 && (
            <Alert color="yellow" title="Revisa antes de subir">
              {preview.warnings.map((w) => (
                <Text key={w} size="sm">
                  {w}
                </Text>
              ))}
              <Text size="sm" mt={4}>
                Puedes desmarcar las filas que sobren y subir; después puedes ajustar los
                movimientos a mano.
              </Text>
            </Alert>
          )}

          {/* Native scroll: the browser's scrollbar is always visible and the header row
              stays on top; the height leaves room for the rest of the dialog. */}
          <Table.ScrollContainer
            minWidth={900}
            type="native"
            // Not `maxHeight`: with type="native" Mantine sets it on an inner box that
            // doesn't scroll.
            style={{ maxHeight: 'max(320px, calc(100dvh - 420px))', overflowY: 'auto' }}
          >
            <Table stickyHeader verticalSpacing={4} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      aria-label="Seleccionar todos"
                      checked={chosen.length === rows.length}
                      indeterminate={chosen.length > 0 && chosen.length < rows.length}
                      onChange={(e) => {
                        const selected = e.currentTarget.checked;
                        setEdits((prev) => prev.map((row) => ({ ...row, selected })));
                      }}
                    />
                  </Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th>Tarjeta</Table.Th>
                  <Table.Th w={150}>Tipo</Table.Th>
                  <Table.Th ta="right">Monto</Table.Th>
                  <Table.Th w={220}>Categoría / cuenta</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r, i) => {
                  const e = edits[i];
                  if (!e) return null;
                  const outflow = isOutflow(r.kind);
                  return (
                    <Table.Tr key={i} style={{ opacity: e.selected ? 1 : 0.5 }}>
                      <Table.Td>
                        <Checkbox
                          aria-label={`Incluir ${r.description}`}
                          checked={e.selected}
                          onChange={(ev) => edit(i, { selected: ev.currentTarget.checked })}
                        />
                      </Table.Td>
                      <Table.Td>{formatDate(r.date)}</Table.Td>
                      <Table.Td maw={320}>
                        <Text size="sm">{r.description}</Text>
                        {r.notes && (
                          <Text size="xs" c="dimmed" lineClamp={1} title={r.notes}>
                            {r.notes}
                          </Text>
                        )}
                        {r.skip_reason && (
                          <Text size="xs" c="yellow.8">
                            {r.skip_reason}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{r.card_ending ? `***${r.card_ending}` : '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        {r.kind === 'payment' ? (
                          <Badge variant="light" color={KIND_COLORS.payment}>
                            {STATEMENT_ROW_KIND_LABELS.payment}
                          </Badge>
                        ) : (
                          <Select
                            size="xs"
                            aria-label={`Tipo de ${r.description}`}
                            data={kindOptions(r)}
                            allowDeselect={false}
                            value={e.kind}
                            onChange={(v) => v && edit(i, { kind: v as RowKind })}
                            styles={{
                              input: { color: `var(--mantine-color-${KIND_COLORS[e.kind]}-7)` },
                            }}
                          />
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={600} c={outflow ? undefined : 'teal'}>
                          {outflow ? '−' : '+'}
                          {formatMoney(r.amount, account?.currency)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {isTransfer(e.kind) ? (
                          <AccountSelect
                            size="xs"
                            placeholder={outflow ? 'Cuenta destino' : 'Cuenta origen'}
                            excludeId={accountId}
                            value={e.counterpart_account_id}
                            onChange={(v) => edit(i, { counterpart_account_id: v })}
                            error={e.selected && e.counterpart_account_id === null}
                          />
                        ) : (
                          e.kind !== 'payment' && (
                            <CategorySelect
                              size="xs"
                              kind={e.kind === 'expense' ? 'expense' : 'income'}
                              placeholder="Sin categoría"
                              value={e.category_id}
                              onChange={(v) => edit(i, { category_id: v })}
                            />
                          )
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {needsSource && (
            <AccountSelect
              label="Cuenta de origen de los pagos a la tarjeta"
              description="Los pagos se registran como transferencias desde esta cuenta."
              placeholder="Elige la cuenta"
              excludeId={accountId}
              value={sourceId}
              onChange={setSourceId}
            />
          )}
          {missingCounterpart && (
            <Text size="sm" c="red">
              Elige la cuenta de cada transferencia seleccionada.
            </Text>
          )}
        </>
      )}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {preview &&
            `${chosen.length} seleccionados · neto ${formatMoney(net, account?.currency)}`}
        </Text>
        <Group>
          <Button variant="default" onClick={onDone}>
            Cancelar
          </Button>
          <Button onClick={upload} disabled={!canSave} loading={save.isPending}>
            Subir ({chosen.length})
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** Statements already loaded into the account; deleting one deletes its movements. */
function PreviousLoads({ accountId }: { accountId: number }) {
  const { data: loads = [] } = useStatementImports(accountId);
  const remove = useDeleteStatementImport();
  if (loads.length === 0) return null;

  function confirmDelete(load: Schemas['StatementImportOut']) {
    modals.openConfirmModal({
      title: 'Eliminar carga',
      children: (
        <Text size="sm">
          Se eliminarán los {load.row_count} movimientos del periodo {formatDate(load.period_start)}{' '}
          al {formatDate(load.period_end)}, incluidas sus transferencias. Después podrás volver a
          cargar ese estado de cuenta.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(load.id),
    });
  }

  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        Cargas anteriores
      </Text>
      <Table verticalSpacing={2}>
        <Table.Tbody>
          {loads.map((load) => (
            <Table.Tr key={load.id}>
              <Table.Td>
                {formatDate(load.period_start)} al {formatDate(load.period_end)}
              </Table.Td>
              <Table.Td>{load.row_count} movimientos</Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  Cargado el {formatDate(load.created_at)}
                </Text>
              </Table.Td>
              <Table.Td w={40}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Eliminar carga ${formatDate(load.period_start)}`}
                  onClick={() => confirmDelete(load)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

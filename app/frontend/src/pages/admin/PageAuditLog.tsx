/**
 * Pagina Audit Log — elenco in sola lettura delle azioni sensibili registrate
 * da `AuditLogService` (login, impersonificazione, modifiche utenti, reset MFA,
 * ecc.). Stesso pattern elenco di `PageUsers` (`ResponsiveTable` + `ListToolbar`
 * + `usePaginatedList`), senza creazione/modifica: solo consultazione e filtri.
 */
import { useState } from 'react';
import { Group, NumberInput, ScrollArea, Text, TextInput } from '@mantine/core';
import {
  fetchAuditLog,
  type AuditLogItem,
  type AuditLogQueryParams,
} from '../../services/admin.service';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ListToolbar from '../../components/ListToolbar';
import PageHeader from '../../components/PageHeader';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';

/** Formatta una data ISO nel formato locale italiano (data + ora). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT');
}

/** Pagina di consultazione dell'audit log (Admin+). */
export default function PageAuditLog(): JSX.Element {
  const [userId, setUserId] = useState<string | number>('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const extraParams: Partial<AuditLogQueryParams> = {
    userId: userId === '' ? undefined : Number(userId),
    action: action || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { records, total, totalPages, page, setPage, limit, setLimit, search, setSearch, loading } =
    usePaginatedList<AuditLogItem, Partial<AuditLogQueryParams>>(fetchAuditLog, {
      errorMessage: "Errore nel caricamento dell'audit log",
      extraParams,
    });

  const columns: ResponsiveTableColumn<AuditLogItem>[] = [
    { key: 'createdAt', label: 'Data', render: (row) => formatDate(row.createdAt) },
    { key: 'action', label: 'Azione' },
    { key: 'entity', label: 'Entità', render: (row) => row.entity ?? '—' },
    { key: 'entityId', label: 'ID entità', render: (row) => row.entityId ?? '—' },
    { key: 'userId', label: 'Utente', render: (row) => row.userId ?? '—' },
    {
      key: 'impersonatedBy',
      label: 'Impersonato da',
      hideInCard: true,
      render: (row) => row.impersonatedBy ?? '—',
    },
    { key: 'ip', label: 'IP', hideInCard: true, render: (row) => row.ip ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Amministrazione' }, { label: 'Audit Log' }]}
        title="Audit Log"
      />

      <ContentCard>
        <ListToolbar
          state={{ page, setPage, totalPages, limit, setLimit, total, search, setSearch }}
          searchPlaceholder="Cerca per azione, entità..."
          filters={
            <Group gap="sm" wrap="wrap">
              <NumberInput
                label="ID utente"
                placeholder="es. 12"
                value={userId}
                onChange={setUserId}
                w={120}
                hideControls
              />
              <TextInput
                label="Azione"
                placeholder="es. login"
                value={action}
                onChange={(e) => setAction(e.currentTarget.value)}
                w={160}
              />
              <TextInput
                label="Da"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.currentTarget.value)}
                w={160}
              />
              <TextInput
                label="A"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.currentTarget.value)}
                w={160}
              />
            </Group>
          }
        />

        <ScrollArea offsetScrollbars>
          <ResponsiveTable<AuditLogItem>
            data={records}
            loading={loading}
            rowKey={(row) => row.guid}
            columns={columns}
            emptyText="Nessuna azione registrata"
            cardHeader={(row) => (
              <div>
                <Text fw={600}>{row.action}</Text>
                <Text size="xs" c="dimmed">
                  {formatDate(row.createdAt)}
                </Text>
              </div>
            )}
          />
        </ScrollArea>
      </ContentCard>
    </div>
  );
}

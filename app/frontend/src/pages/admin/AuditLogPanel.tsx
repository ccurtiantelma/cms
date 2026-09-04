/** Pannello audit log incorporato nella pagina di gestione utenti. */
import { useState } from 'react';
import { Group, NumberInput, ScrollArea, Text, TextInput } from '@mantine/core';
import {
  fetchAuditLog,
  type AuditLogItem,
  type AuditLogQueryParams,
} from '../../services/admin.service';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ListToolbar from '../../components/ListToolbar';
import ContentCard from '../../components/ContentCard';
import ResponsiveTable, { type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDate } from '../../utils/date.utils';

/** Elenco in sola lettura delle azioni sensibili registrate. */
export default function AuditLogPanel(): JSX.Element {
  const [userId, setUserId] = useState<string | number>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const extraParams: Partial<AuditLogQueryParams> = {
    userId: userId === '' ? undefined : Number(userId),
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
    { key: 'ip', label: 'IP', hideInCard: true, render: (row) => row.ip ?? '—' },
  ];

  return (
    <ContentCard>
      <ListToolbar
        state={{ page, setPage, totalPages, limit, setLimit, total, search, setSearch }}
        searchPlaceholder="Cerca per azione, entità..."
        filters={
          <Group gap="sm" wrap="wrap">
            <NumberInput
              aria-label="ID utente"
              placeholder="es. 12"
              value={userId}
              onChange={setUserId}
              w={120}
              hideControls
            />
            <TextInput
              label="Da"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.currentTarget.value)}
              w={160}
            />
            <TextInput
              label="A"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.currentTarget.value)}
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
  );
}

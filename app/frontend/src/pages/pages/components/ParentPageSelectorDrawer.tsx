import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Table, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { fetchPages } from '../../../services/pages.service';
import { getErrorMessage } from '../../../utils/api.utils';
import { notifications } from '@mantine/notifications';
import type { PageRecord, PagesQueryParams } from '../../../types/pages.types';

interface ParentPageSelectorDrawerProps {
  currentPageGuid: string;
  value: string;
  onChange: (guid: string) => void;
}

/** Drawer con elenco filtrabile delle Pagine selezionabili come genitore. */
export default function ParentPageSelectorDrawer({
  currentPageGuid,
  value,
  onChange,
}: ParentPageSelectorDrawerProps): JSX.Element {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState('');

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setLoading(true);
    const params: PagesQueryParams = { p: 1, i: 100, q: search.trim() || undefined };
    fetchPages(params)
      .then((result) => {
        if (!cancelled) {
          setPages(result.items.filter((page) => page.guid !== currentPageGuid));
          const selected = result.items.find((page) => page.guid === value);
          if (selected) setSelectedTitle(selected.title);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPages([]);
          notifications.show({
            color: 'red',
            message: getErrorMessage(error, 'Errore nel caricamento delle Pagine'),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPageGuid, opened, search, value]);

  function selectParent(page: PageRecord): void {
    onChange(page.guid);
    setSelectedTitle(page.title);
    setOpened(false);
  }

  function clearParent(): void {
    onChange('');
    setSelectedTitle('');
  }

  return (
    <>
      <Group align="flex-end" gap="xs">
        <TextInput
          label="Pagina genitore"
          value={selectedTitle || value || 'Nessuna pagina genitore'}
          readOnly
          style={{ flex: 1 }}
        />
        <Button variant="default" onClick={() => setOpened(true)}>
          Seleziona
        </Button>
        {value && (
          <Button variant="subtle" color="gray" onClick={clearParent}>
            Radice
          </Button>
        )}
      </Group>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title="Seleziona pagina genitore"
        position="right"
        size="min(42rem, 100vw)"
        zIndex={1100}
      >
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Filtra per titolo o slug..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          mb="md"
          aria-label="Filtra pagine genitore"
        />
        <Table.ScrollContainer minWidth={520}>
          <Table highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Titolo</Table.Th>
                <Table.Th>Slug</Table.Th>
                <Table.Th>Lingua</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pages.map((page) => (
                <Table.Tr key={page.guid}>
                  <Table.Td>{page.title}</Table.Td>
                  <Table.Td>{page.slug}</Table.Td>
                  <Table.Td>{page.locale}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant={page.guid === value ? 'light' : 'subtle'}
                      onClick={() => selectParent(page)}
                    >
                      {page.guid === value ? 'Selezionata' : 'Seleziona'}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {!loading && pages.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed" ta="center">
                      Nessuna pagina trovata
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {loading && (
          <Text size="sm" c="dimmed" mt="sm">
            Caricamento...
          </Text>
        )}
      </Drawer>
    </>
  );
}

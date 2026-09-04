/**
 * Modal di confronto strutturale fra due Revisioni (F07-02, Tab "Revisioni" di
 * `PagePageDetail.tsx`). Consuma `GET /app/pages/:guid/revisions/diff`
 * (`fetchPageRevisionDiff`), che lavora per id di nodo: nessuna label/tipo di blocco
 * leggibile arriva dal backend, quindi si mostrano gli id così come sono.
 *
 * Stessa forma di `CreateTranslationModal.tsx`: `Modal` con `zIndex={1100}` — qui non
 * strettamente necessario (non è mai aperto sopra la chrome full-screen dell'editor, dato
 * che vive nella Tab "Revisioni" del dettaglio Pagina), ma riusato per coerenza di stile.
 */
import { useState } from 'react';
import {
  Accordion,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getErrorMessage } from '../../../utils/api.utils';
import { formatDate } from '../../../utils/date.utils';
import { fetchPageRevisionDiff } from '../../../services/pages.service';
import type { PageRevisionDiff, PageRevisionSummary } from '../../../types/pages.types';

/**
 * Serializza un valore `unknown` di `PropertyDiff.before`/`after` per la cella della
 * tabella: stringhe/numeri/booleani si mostrano diretti, il resto (oggetti, array, `null`)
 * passa per `JSON.stringify`.
 */
function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

interface RevisionDiffModalProps {
  opened: boolean;
  onClose: () => void;
  /** Guid della Pagina proprietaria delle Revisioni da confrontare. */
  pageGuid: string;
  /** Elenco Revisioni già caricato dalla Tab "Revisioni" — non richiesto di nuovo qui. */
  revisions: PageRevisionSummary[];
  /**
   * Delega il ripristino al genitore (`PagePageDetail.tsx`), che possiede già il
   * meccanismo completo (`restoreTarget` + `ConfirmModal` + `handleRestoreConfirm`). Questa
   * modal non chiama mai `restorePageRevision` né apre una propria conferma: si limita a
   * risolvere il guid selezionato nell'oggetto `PageRevisionSummary` e a propagarlo.
   */
  onRestore?: (revision: PageRevisionSummary) => void;
}

/** Modal "Confronta Revisioni": due `Select` + risultato del diff in 4 sezioni. */
export default function RevisionDiffModal({
  opened,
  onClose,
  pageGuid,
  revisions,
  onRestore,
}: RevisionDiffModalProps): JSX.Element {
  const [revA, setRevA] = useState<string | null>(null);
  const [revB, setRevB] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<PageRevisionDiff | null>(null);

  const options = revisions.map((revision) => ({
    value: revision.guid,
    label: `#${revision.revisionNumber} — ${revision.title} (${formatDate(revision.createdAt)})`,
  }));

  const compareDisabled = !revA || !revB || revA === revB;

  /** Chiude la modal e ripulisce lo stato locale, per non riproporre un vecchio confronto. */
  function handleClose(): void {
    setRevA(null);
    setRevB(null);
    setDiff(null);
    onClose();
  }

  async function handleCompare(): Promise<void> {
    if (!revA || !revB) return;
    setLoading(true);
    try {
      const result = await fetchPageRevisionDiff(pageGuid, revA, revB);
      setDiff(result);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel confronto delle Revisioni'),
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Risolve il guid selezionato (`revA`/`revB`) nella `PageRevisionSummary` corrispondente
   * dentro `revisions` e lo propaga al genitore via `onRestore`. Nessuna chiamata di rete e
   * nessuna conferma qui: la modal di conferma è quella già cablata in `PagePageDetail.tsx`.
   */
  function handleRestoreClick(guid: string | null): void {
    if (!guid || !onRestore) return;
    const revision = revisions.find((item) => item.guid === guid);
    if (!revision) return;
    onRestore(revision);
  }

  const hasNoDifferences =
    diff !== null &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    Object.keys(diff.modified).length === 0;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Confronta Revisioni"
      size="lg"
      centered
      zIndex={1100}
    >
      <Stack gap="md">
        <Group grow align="flex-end">
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              label="Revisione A"
              placeholder="Seleziona una Revisione"
              data={options}
              value={revA}
              onChange={setRevA}
              searchable
              style={{ flex: 1 }}
            />
            <Button
              variant="light"
              color="orange"
              leftSection={<IconRestore size={16} />}
              disabled={!revA}
              onClick={() => handleRestoreClick(revA)}
            >
              Ripristina Revisione A
            </Button>
          </Group>
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              label="Revisione B"
              placeholder="Seleziona una Revisione"
              data={options}
              value={revB}
              onChange={setRevB}
              searchable
              style={{ flex: 1 }}
            />
            <Button
              variant="light"
              color="orange"
              leftSection={<IconRestore size={16} />}
              disabled={!revB}
              onClick={() => handleRestoreClick(revB)}
            >
              Ripristina Revisione B
            </Button>
          </Group>
        </Group>

        <Group justify="flex-end">
          <Button onClick={() => void handleCompare()} loading={loading} disabled={compareDisabled}>
            Confronta
          </Button>
        </Group>

        {diff === null && (
          <Text size="sm" c="dimmed">
            Seleziona due Revisioni e conferma per vedere il confronto.
          </Text>
        )}

        {diff !== null && hasNoDifferences && (
          <Text size="sm" c="dimmed">
            Nessuna differenza fra le due Revisioni selezionate.
          </Text>
        )}

        {diff !== null && !hasNoDifferences && (
          <Stack gap="md">
            {diff.added.length > 0 && (
              <Box>
                <Text fw={600} size="sm" mb={4}>
                  Blocchi aggiunti
                </Text>
                <Group gap="xs">
                  {diff.added.map((nodeId) => (
                    <Badge
                      key={nodeId}
                      variant="outline"
                      title={nodeId}
                      style={{ borderColor: '#2e7d32', color: '#2e7d32' }}
                    >
                      {nodeId}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            {diff.removed.length > 0 && (
              <Box>
                <Text fw={600} size="sm" mb={4}>
                  Blocchi rimossi
                </Text>
                <Group gap="xs">
                  {diff.removed.map((nodeId) => (
                    <Badge
                      key={nodeId}
                      variant="outline"
                      title={nodeId}
                      style={{ borderColor: '#c62828', color: '#c62828' }}
                    >
                      {nodeId}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            {Object.keys(diff.modified).length > 0 && (
              <Box>
                <Text fw={600} size="sm" mb={4}>
                  Blocchi modificati
                </Text>
                <Stack gap="sm">
                  {Object.entries(diff.modified).map(([nodeId, properties]) => (
                    <Card key={nodeId} withBorder style={{ borderColor: '#ed6c02' }}>
                      <Text size="sm" fw={600} mb="xs" title={nodeId}>
                        {nodeId}
                      </Text>
                      <Table withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Proprietà</Table.Th>
                            <Table.Th>Valore Precedente</Table.Th>
                            <Table.Th>Nuovo Valore</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {properties.map((property) => (
                            <Table.Tr key={property.field}>
                              <Table.Td>{property.field}</Table.Td>
                              <Table.Td>{formatDiffValue(property.before)}</Table.Td>
                              <Table.Td>{formatDiffValue(property.after)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

            {diff.unchanged.length > 0 && (
              <Accordion variant="contained">
                <Accordion.Item value="unchanged">
                  <Accordion.Control>
                    Blocchi invariati ({diff.unchanged.length})
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Group gap="xs">
                      {diff.unchanged.map((nodeId) => (
                        <Badge key={nodeId} color="gray" variant="light" title={nodeId}>
                          {nodeId}
                        </Badge>
                      ))}
                    </Group>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

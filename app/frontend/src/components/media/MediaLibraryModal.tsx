/**
 * Modal "Libreria Media" (RFC-F05/F09 § 5): selezione e upload di un media
 * editoriale. Restituisce al chiamante il `MediaFileRecord` scelto — mai un URL
 * composto qui: il `src` di un media si risolve in un solo punto,
 * `resolveMediaSrc()` di `components/blocks/media-url.ts`, condiviso fra
 * `app/frontend` e `app/public-site` (ADR-27 § 6).
 *
 * Vive in `components/media/` e non in `pages/pages/editor/`: non sa nulla
 * dell'editor a blocchi né dello store Zustand dell'albero. Chi la apre riceve
 * il record e decide cosa farne — l'ispettore scrive `mediaRef`, un futuro
 * chiamante potrebbe fare altro. Un `useBlockEditorStore` qui dentro la
 * legherebbe all'editor per sempre.
 *
 * **Drop zone senza `@mantine/dropzone`.** Il pacchetto non è installato e una
 * dipendenza nuova richiede approvazione umana (CLAUDE.md § Ask first). Il
 * drag-and-drop di file è API nativa del browser (`dragover`/`drop` su
 * `DataTransfer.files`): quattro handler, nessun pacchetto. La regola Mantine
 * non è violata — riguarda i *componenti* di UI (qui `Modal`, `TextInput`,
 * `SimpleGrid`, `Button`, `Pagination`), non gli eventi DOM.
 *
 * L'elenco passa da `usePaginatedList` (CLAUDE.md § Frontend, "riusa hook
 * esistenti"): paginazione `?p=&i=&q=&o=&d=`, ricerca e notifica d'errore
 * arrivano da lì invece di essere riscritte.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Pagination,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPhoto, IconSearch, IconUpload, IconX } from '@tabler/icons-react';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { fetchMediaFiles, uploadMediaFile } from '../../services/media.service';
import {
  PAGE_MEDIA_ENTITY,
  type MediaFileRecord,
  type MediaListFilters,
} from '../../types/media.types';
import { resolveMediaSrc } from '../blocks/media-url';
import styles from './MediaLibraryModal.module.css';

/** Prefisso MIME predefinito: la libreria dell'editor serve blocchi `image`. */
const DEFAULT_MIME_PREFIX = 'image/';

/** Soglie di formattazione della dimensione file, dal byte al megabyte. */
const KILOBYTE = 1024;

/** Rende leggibile una dimensione in byte, senza dipendenze. */
function formatSize(sizeBytes: number): string {
  if (sizeBytes < KILOBYTE) return `${sizeBytes} B`;
  if (sizeBytes < KILOBYTE * KILOBYTE) return `${Math.round(sizeBytes / KILOBYTE)} KB`;
  return `${(sizeBytes / (KILOBYTE * KILOBYTE)).toFixed(1)} MB`;
}

interface MediaLibraryModalProps {
  /** Stato di apertura, controllato dal chiamante. */
  opened: boolean;
  onClose: () => void;
  /**
   * Chiamata alla conferma con il record scelto. Il chiamante decide cosa
   * farne: l'ispettore ne scrive il `guid` nella prop `mediaRef`.
   */
  onSelect: (file: MediaFileRecord) => void;
  /** Prefisso MIME ammesso; default `image/`. */
  mimePrefix?: string;
  /** `guid` già referenziato dal chiamante, preselezionato all'apertura. */
  currentGuid?: string;
  /**
   * z-index del `Modal`. Necessario perché il default 200 di Mantine finisce **sotto**
   * `FullScreenEditorLayout` (livello 1000): chi apre la libreria da dentro l'editor deve
   * passare un valore superiore. Fuori dall'editor si omette.
   */
  zIndex?: number;
}

/** Modal di selezione e upload di un media editoriale (RFC-F05/F09 § 5). */
export default function MediaLibraryModal({
  opened,
  onClose,
  onSelect,
  mimePrefix = DEFAULT_MIME_PREFIX,
  currentGuid,
  zIndex,
}: MediaLibraryModalProps): JSX.Element {
  const [selectedGuid, setSelectedGuid] = useState<string | null>(currentGuid ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { records, totalPages, page, setPage, search, setSearch, loading, reload } =
    usePaginatedList<MediaFileRecord, MediaListFilters>(fetchMediaFiles, {
      errorMessage: 'Caricamento della libreria media non riuscito',
      extraParams: { entity: PAGE_MEDIA_ENTITY, mimePrefix },
      // Nessuna chiamata finché la modal è chiusa: l'hook rifà il fetch da sé
      // quando `enabled` torna `true`, senza un effetto di apertura dedicato.
      enabled: opened,
    });

  /** Scarta il file in attesa e revoca l'URL oggetto della sua anteprima. */
  const clearPending = useCallback((): void => {
    setPendingFile(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // L'anteprima è un blob URL: va revocata, altrimenti ogni file trascinato e
  // scartato resta allocato per tutta la vita del documento.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Alla chiusura si riparte puliti: un file trascinato ma mai caricato non
  // deve riapparire alla riapertura successiva.
  useEffect(() => {
    if (!opened) {
      clearPending();
      setIsDragging(false);
    }
  }, [opened, clearPending]);

  // La preselezione segue il `guid` del chiamante a ogni apertura: riaprire la
  // modal su un altro blocco `image` non deve mostrare la scelta precedente.
  useEffect(() => {
    if (opened) setSelectedGuid(currentGuid ?? null);
  }, [opened, currentGuid]);

  /** Accetta un file dalla drop zone o dal file picker, mostrandone l'anteprima. */
  function acceptFile(file: File | undefined): void {
    if (!file) return;
    if (!file.type.startsWith(mimePrefix)) {
      notifications.show({
        color: 'orange',
        message: `Formato non ammesso: sono accettati solo file «${mimePrefix}».`,
      });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  /** Carica il file in attesa e lo preseleziona nella griglia ricaricata. */
  async function handleUpload(): Promise<void> {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(pendingFile);
      notifications.show({ color: 'green', message: 'Immagine caricata.' });
      clearPending();
      setSelectedGuid(uploaded.guid);
      await reload();
    } catch {
      // L'interceptor Axios ha già notificato 403/404/5xx: qui si copre il
      // resto (400 di formato rifiutato, 413 oltre il limite di dimensione).
      notifications.show({ color: 'red', message: 'Caricamento non riuscito.' });
    } finally {
      setUploading(false);
    }
  }

  /** Conferma la selezione corrente e chiude. */
  function handleConfirm(): void {
    const chosen = records.find((record) => record.guid === selectedGuid);
    if (!chosen) return;
    onSelect(chosen);
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Libreria Media"
      size="xl"
      centered
      zIndex={zIndex}
    >
      <Stack gap="md">
        {/* ─── Drop zone ─────────────────────────────────────────────────── */}
        <div
          className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
          data-testid="media-drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            acceptFile(event.dataTransfer.files?.[0]);
          }}
        >
          {previewUrl && pendingFile ? (
            <Group justify="space-between" wrap="nowrap" w="100%">
              <Group wrap="nowrap" gap="sm">
                <img className={styles.preview} src={previewUrl} alt={pendingFile.name} />
                <div>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {pendingFile.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatSize(pendingFile.size)}
                  </Text>
                </div>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  loading={uploading}
                  leftSection={<IconUpload size={14} />}
                  onClick={() => void handleUpload()}
                >
                  Carica
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  disabled={uploading}
                  leftSection={<IconX size={14} />}
                  onClick={clearPending}
                >
                  Annulla
                </Button>
              </Group>
            </Group>
          ) : (
            <Stack align="center" gap={4}>
              <IconUpload size={22} />
              <Text size="sm">Trascina qui un&apos;immagine, oppure</Text>
              <Button size="xs" variant="light" onClick={() => fileInputRef.current?.click()}>
                Scegli un file
              </Button>
            </Stack>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={`${mimePrefix}*`}
            className={styles.hiddenInput}
            data-testid="media-file-input"
            onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
          />
        </div>

        {/* ─── Ricerca ───────────────────────────────────────────────────── */}
        <TextInput
          placeholder="Cerca per nome file"
          aria-label="Cerca per nome file"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
        />

        {/* ─── Griglia ───────────────────────────────────────────────────── */}
        {loading ? (
          <Center mih={200}>
            <Loader size="sm" />
          </Center>
        ) : records.length === 0 ? (
          <Alert color="gray" icon={<IconAlertCircle size={16} />}>
            {search
              ? 'Nessuna immagine corrisponde alla ricerca.'
              : 'Nessuna immagine in libreria: caricane una trascinandola qui sopra.'}
          </Alert>
        ) : (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
            {records.map((record) => (
              <button
                key={record.guid}
                type="button"
                className={`${styles.tile} ${
                  record.guid === selectedGuid ? styles.tileSelected : ''
                }`}
                aria-pressed={record.guid === selectedGuid}
                aria-label={record.originalName}
                onClick={() => setSelectedGuid(record.guid)}
                onDoubleClick={() => {
                  setSelectedGuid(record.guid);
                  onSelect(record);
                  onClose();
                }}
              >
                <span className={styles.thumbFrame}>
                  {/* `resolveMediaSrc` e non `record.url`: unica risoluzione del
                      src, condivisa con il sito pubblico (ADR-27 § 6). */}
                  <img
                    className={styles.thumb}
                    src={resolveMediaSrc(record.guid)}
                    alt={record.originalName}
                    loading="lazy"
                  />
                </span>
                <Text size="xs" lineClamp={1} ta="center">
                  {record.originalName}
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                  {record.width && record.height
                    ? `${record.width}×${record.height}`
                    : formatSize(record.sizeBytes)}
                </Text>
              </button>
            ))}
          </SimpleGrid>
        )}

        {totalPages > 1 && (
          <Group justify="center">
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}

        {/* ─── Azioni ────────────────────────────────────────────────────── */}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Annulla
          </Button>
          <Button
            leftSection={<IconPhoto size={16} />}
            disabled={!selectedGuid}
            onClick={handleConfirm}
          >
            Seleziona Immagine
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

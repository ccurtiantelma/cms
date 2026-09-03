/**
 * Modal "Ritaglio & Punto Focale" di un asset immagine (ADR-49): regola il punto focale con
 * `FocalPointPicker` e accoda, su un preset nominato, la generazione asincrona di una
 * variante trasformata — mai una trasformazione eseguita qui: il lavoro pixel-level vive nel
 * worker BullMQ (`MediaProcessor`), questa modal si limita a `PATCH .../focal-point` e
 * `POST .../transform` (`services/media.service.ts`).
 *
 * **Preset chiusi, mai un crop continuo**: le quattro voci sotto ricalcano
 * `MediaTransformPreset` del backend (`files/dto/media-transform.dto.ts`) — un quinto preset
 * o un rapporto diverso richiede una nuova ADR, non si aggiunge qui di propria iniziativa
 * (ADR-49 § Conseguenze). Le dimensioni mostrate sono quelle realmente applicate dal worker
 * (`PRESET_DIMENSIONS` di `media.processor.ts`): un'etichetta diversa da quella confonderebbe
 * l'editor su cosa verrà davvero generato.
 *
 * Non scrive alcuna prop di blocco: a differenza di `MediaLibraryModal` (che restituisce un
 * `MediaFileRecord` al chiamante), qui non c'è nulla da riportare nello store dell'editor — il
 * punto focale e le varianti vivono sulla riga `files`, letta da `resolveMediaSrc()`/dal
 * worker, mai da una prop del nodo `image`. Il chiamante riceve solo `onClose`.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconWand } from '@tabler/icons-react';
import FocalPointPicker from './FocalPointPicker';
import {
  fetchMediaMetadata,
  requestImageTransform,
  updateFocalPoint,
} from '../../services/media.service';
import type { MediaFileRecord, MediaTransformPresetName } from '../../types/media.types';
import { resolveMediaSrc } from '../blocks/media-url';

/**
 * Preset nominati (ADR-49 § M6) con le dimensioni pixel realmente applicate dal worker
 * (`PRESET_DIMENSIONS`, `media.processor.ts`) — valori implementativi del worker, rivedibili
 * senza nuova ADR finché restano dentro questo stesso insieme di quattro nomi.
 */
export const MEDIA_TRANSFORM_PRESETS: ReadonlyArray<{
  value: MediaTransformPresetName;
  label: string;
  ratioLabel: string;
  width: number;
  height: number;
}> = [
  { value: 'thumbnail', label: 'Thumbnail', ratioLabel: '1:1', width: 400, height: 400 },
  { value: 'card', label: 'Card', ratioLabel: '16:9', width: 800, height: 450 },
  { value: 'hero', label: 'Hero', ratioLabel: '21:9', width: 1600, height: 762 },
  { value: 'og', label: 'Social OG', ratioLabel: '1.91:1', width: 1200, height: 628 },
];

const CENTER_FOCAL = 50;

export interface MediaCropperModalProps {
  opened: boolean;
  /** `guid` dell'asset sorgente su cui operare. */
  guid: string;
  onClose: () => void;
  /**
   * z-index del `Modal`, stessa ragione di `MediaLibraryModal`: aperta da dentro l'editor
   * deve superare il livello 1000 di `FullScreenEditorLayout`.
   */
  zIndex?: number;
}

/** Modal di ritaglio e punto focale di un asset immagine (ADR-49). */
export default function MediaCropperModal({
  opened,
  guid,
  onClose,
  zIndex,
}: MediaCropperModalProps): JSX.Element {
  const [record, setRecord] = useState<MediaFileRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [focalX, setFocalX] = useState(CENTER_FOCAL);
  const [focalY, setFocalY] = useState(CENTER_FOCAL);
  const [selectedPreset, setSelectedPreset] = useState<MediaTransformPresetName | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ricarica sempre alla nuova apertura: un asset diverso non deve mostrare il punto focale
  // dell'asset precedente per la durata della fetch.
  useEffect(() => {
    if (!opened || !guid) return;
    setLoading(true);
    setLoadError(false);
    setSelectedPreset(null);
    fetchMediaMetadata(guid)
      .then((data) => {
        setRecord(data);
        setFocalX(data.focalX);
        setFocalY(data.focalY);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [opened, guid]);

  /** Persiste il punto focale, poi accoda la generazione della variante sul preset scelto. */
  async function handleGenerate(): Promise<void> {
    if (!selectedPreset) return;
    setSubmitting(true);
    try {
      const updated = await updateFocalPoint(guid, focalX, focalY);
      setRecord(updated);
      const { jobId } = await requestImageTransform(guid, {
        focalX,
        focalY,
        preset: selectedPreset,
      });
      notifications.show({
        color: 'green',
        message: `Variante «${selectedPreset}» accodata (job #${jobId}). La generazione è asincrona: sarà pronta a breve.`,
      });
    } catch {
      // L'interceptor Axios ha già notificato 403/404/5xx: qui resta il caso 400
      // (focalX/focalY fuori range, non raggiungibile da questo controllo ma difensivo).
      notifications.show({ color: 'red', message: 'Richiesta non riuscita.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Ritaglio & Punto Focale"
      size="lg"
      centered
      zIndex={zIndex}
    >
      <Stack gap="md">
        {loading ? (
          <Center mih={200}>
            <Loader size="sm" />
          </Center>
        ) : loadError || !record ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            Impossibile caricare i metadati dell&apos;immagine.
          </Alert>
        ) : (
          <>
            <FocalPointPicker
              imageUrl={resolveMediaSrc(guid)}
              focalX={focalX}
              focalY={focalY}
              onChange={(x, y) => {
                setFocalX(x);
                setFocalY(y);
              }}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Preset di destinazione
              </Text>
              <SegmentedControl
                fullWidth
                value={selectedPreset ?? ''}
                onChange={(next) => setSelectedPreset(next as MediaTransformPresetName)}
                data={MEDIA_TRANSFORM_PRESETS.map((preset) => ({
                  value: preset.value,
                  label: preset.label,
                }))}
              />
              {selectedPreset && (
                <Text size="xs" c="dimmed" mt={4}>
                  {
                    MEDIA_TRANSFORM_PRESETS.find((preset) => preset.value === selectedPreset)
                      ?.ratioLabel
                  }{' '}
                  ·{' '}
                  {MEDIA_TRANSFORM_PRESETS.find((preset) => preset.value === selectedPreset)?.width}
                  ×
                  {
                    MEDIA_TRANSFORM_PRESETS.find((preset) => preset.value === selectedPreset)
                      ?.height
                  }
                  px
                </Text>
              )}
            </div>
          </>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Chiudi
          </Button>
          <Button
            leftSection={<IconWand size={16} />}
            disabled={!record || !selectedPreset}
            loading={submitting}
            onClick={() => void handleGenerate()}
          >
            Genera Variante
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Ispettore delle proprietà del blocco selezionato (PLAN-F04-editor-visivo.md T5,
 * ispettore a schede PLAN-F04c-editor-maturo.md T6, restyle T-inspector-restyle).
 *
 * **Un solo componente per tutti i tipi di blocco.** Non esiste — e non va introdotto —
 * un `HeadingInspector`/`ButtonInspector`: il form è generato leggendo il descrittore del
 * tipo in `BLOCK_TYPES` (generato dal registro backend, ADR-21) e mappando `PropSpec.kind`
 * al controllo Mantine corrispondente in `inspector/PropField.tsx` — quel file è l'unico
 * punto di dispaccio per `kind`, mai per `type`. Aggiungere una prop al registro la fa
 * comparire qui senza toccare alcun file; aggiungere un tipo di blocco non richiede alcun
 * file nuovo.
 *
 * Questo file resta l'orchestratore: possiede lo stato (`PropertyForm.draft`, la Media
 * Library), decide **quali** props vanno in quale scheda (`groupPropsByTab`,
 * `inspector/inspector.utils.ts`) e monta `inspector/ContentTab.tsx`/`inspector/StyleTab.tsx`/
 * `inspector/AdvancedTab.tsx` passando `draft` e le funzioni di scrittura per prop — mai il
 * contrario: i sotto-componenti non tengono stato proprio, coerente con
 * `VisualBoxModelInspector.tsx` che già riceveva `draft`/`setAndCommit` dall'esterno.
 *
 * Le schede "Contenuto", "Stile" e "Avanzato" (ADR-30 § 1, ADR-37 § 5) sono un
 * raggruppamento dei descrittori *prima* del dispaccio per `kind`: non una seconda via di
 * dispaccio per tipo di blocco. La chrome a schede è `InspectorTabs.tsx` (estratta da qui,
 * T-integrazione-toolbar): una scheda senza props dichiarate non compare — mai una scheda
 * vuota, e con una sola scheda popolata non compaiono nemmeno i `Tabs`. Le etichette vengono
 * **solo** da `meta.props[nome].label`: il nome tecnico resta un fallback per un difetto del
 * registro, mai atteso sui tipi reali (T3 li ha già compilati tutti).
 *
 * La validazione mostrata qui è **solo UX**: l'autorità resta il `400` del server, che
 * `PagePageDetail` traduce nel blocco colpevole. Nessun controllo di questo file blocca il
 * salvataggio — coerente con CLAUDE.md § Frontend ("validazione client solo UX").
 */
import { useState } from 'react';
import { ActionIcon, Alert, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../types/blocks.types';
import styles from './PropertyInspector.module.css';
import {
  useActiveViewport,
  useBlockEditorStore,
  useSelectedNode,
  useTreeGeneration,
} from '../../../hooks/useBlockEditorStore';
import { findLocation, type BlockNode } from './block-tree.utils';
import MediaLibraryModal from '../../../components/media/MediaLibraryModal';
import MediaCropperModal from '../../../components/media/MediaCropperModal';
import type { MediaFileRecord } from '../../../types/media.types';
import ContentTab from './inspector/ContentTab';
import StyleTab from './inspector/StyleTab';
import AdvancedTab from './inspector/AdvancedTab';
import { MEDIA_MODAL_Z_INDEX, asString, groupPropsByTab } from './inspector/inspector.utils';
import InspectorTabs from './InspectorTabs';
import { usePresetStore } from './usePresetStore';

// Riesportate: `VisualBoxModelInspector.tsx` le riusa (invariante protetto, vedi il suo
// commento di testa) e non tutti i chiamanti storici sono stati aggiornati a importare
// direttamente da `inspector/inspector.utils.ts`. Il punto di verità resta comunque quel
// modulo — questo file si limita a passare i nomi.
export {
  asString,
  breakpointKey,
  effectiveScalarForViewport,
  hasExplicitOverrideAtBreakpoint,
  propLabel,
  responsiveEnvelope,
  VIEWPORT_LABELS,
  type PropsMeta,
} from './inspector/inspector.utils';

interface PropertyFormProps {
  node: BlockNode;
  descriptor: BlockTypeDescriptor;
}

/**
 * Form delle proprietà di un singolo nodo. Il componente esportato lo monta con una `key`
 * che unisce l'id del nodo e la generazione dell'albero: cambiare selezione **o** ricaricare
 * l'albero dal server lo rimonta, azzerando le bozze locali senza bisogno di un effetto che
 * le sincronizzi. La generazione è indispensabile perché gli id sopravvivono a un
 * salvataggio: senza, dopo la sanitizzazione server-side il campo continuerebbe a mostrare
 * il testo digitato invece di quello davvero salvato, e il `blur` successivo lo rimanderebbe
 * in store.
 *
 * `draft` è l'**unica** fonte di verità dei valori mostrati: `ContentTab`/`StyleTab` (e, per
 * lo stile, `VisualBoxModelInspector`) lo ricevono come prop e non ne tengono una copia
 * propria. Le scritture testuali vanno in store `onBlur`, non a ogni tasto: un dispatch per
 * carattere farebbe ricalcolare i selettori dell'albero ad ogni battuta (NFR § Performance
 * — editor). I controlli senza semantica di "fine modifica" (`Select`, `Switch`) scrivono
 * invece `onChange`, dove il cambiamento è già l'atto conclusivo.
 */
function PropertyForm({ node, descriptor }: PropertyFormProps): JSX.Element {
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const savePreset = usePresetStore((state) => state.savePreset);
  const convertToGlobalSectionAction = useBlockEditorStore(
    (state) => state.convertToGlobalSectionAction,
  );
  /**
   * Solo per decidere se "Converti in Sezione Globale" (ADR-55) va offerta — un
   * contenitore/`section` di **primo livello**, la sola informazione che questo file
   * possiede e `AdvancedTab.tsx` no (vedi il commento di `onConvertToGlobalSection` in
   * `ContentTab.tsx`). Selettore mirato per id: un cambio altrove nell'albero non
   * ri-renderizza questo form.
   */
  const location = useBlockEditorStore(useShallow((state) => findLocation(state.tree, node.id)));
  const activeViewport = useActiveViewport();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...node.props }));
  /**
   * Nome della prop `mediaRef` la cui Media Library è aperta, o `null`. Si tiene il **nome
   * della prop** e non un booleano: un tipo di blocco può dichiarare più prop `mediaRef`
   * (oggi `image` ne ha una sola), e un flag condiviso scriverebbe la selezione sulla prop
   * sbagliata. La modal è montata una volta sola in fondo al form, mai dentro `renderField`.
   */
  const [mediaPickerProp, setMediaPickerProp] = useState<string | null>(null);
  /**
   * Nome della prop `mediaRef` per cui è aperto `MediaCropperModal`, o `null` — stesso
   * principio di `mediaPickerProp`: si tiene il nome della prop, non un booleano, per
   * restare corretti se in futuro un tipo dichiarasse più prop `mediaRef`.
   */
  const [cropperPickerProp, setCropperPickerProp] = useState<string | null>(null);

  /** Aggiorna la sola bozza locale (nessun dispatch): usato mentre si digita. */
  function setLocal(name: string, value: unknown): void {
    setDraft((previous) => ({ ...previous, [name]: value }));
  }

  /** Scrive nello store, se il valore è davvero cambiato rispetto al nodo. */
  function commit(name: string, value: unknown): void {
    if (Object.is(value, node.props[name])) return;
    updateBlockPropsAction(node.id, { [name]: value });
  }

  /** Scrive nello store immediatamente (controlli senza `onBlur` significativo). */
  function setAndCommit(name: string, value: unknown): void {
    setLocal(name, value);
    commit(name, value);
  }

  if (descriptor.props.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Il blocco &laquo;{descriptor.meta?.label ?? descriptor.type}&raquo; non ha proprietà
        modificabili: si configura aggiungendo blocchi al suo interno.
      </Text>
    );
  }

  const propsMeta = descriptor.meta?.props;

  /**
   * Scrive il `guid` scelto nella prop che ha aperto la libreria. Passa dalla stessa
   * `setAndCommit` di ogni altro `kind` — quindi `updateBlockPropsAction`, e quindi
   * undo/redo, dirty-tracking e `treeGeneration` funzionano senza codice dedicato. È un
   * `guid`, mai un URL: il `src` lo compone `resolveMediaSrc()` in rendering (ADR-27 § 6).
   */
  function handleMediaSelected(file: MediaFileRecord): void {
    if (!mediaPickerProp) return;
    setAndCommit(mediaPickerProp, file.guid);
    setMediaPickerProp(null);
  }

  const { content, style, advanced } = groupPropsByTab(descriptor.props, propsMeta);

  /**
   * "Converti in Sezione Globale" (ADR-55, estende ADR-40): offerta solo su un
   * contenitore/`section` di primo livello, stessa restrizione di
   * `EditorBlockWrapper.tsx` (`isTopLevelContainerOrSection`) — un `globalRef` non può
   * contenere altri blocchi da estrarre, e un nodo annidato più in profondità resta fuori
   * scope di questo round (stessa deviazione dichiarata).
   */
  const isTopLevelContainerOrSection =
    location?.parentId === null && (node.type === 'section' || node.type === 'container');

  const tabProps = {
    draft,
    propsMeta,
    activeViewport,
    setLocal,
    commit,
    setAndCommit,
    onOpenMediaPicker: setMediaPickerProp,
    onOpenCropper: setCropperPickerProp,
    nodeType: node.type,
    onSavePreset: (name: string) => savePreset(name, node),
    onConvertToGlobalSection: isTopLevelContainerOrSection
      ? (title: string) => convertToGlobalSectionAction(node.id, title)
      : undefined,
  };

  /**
   * La libreria è montata **una volta sola**, fuori dai rami di scheda: dentro un
   * `Tabs.Panel` (che monta `keepMounted={false}`) un cambio di scheda a modal aperta la
   * smonterebbe a metà scelta.
   */
  const mediaPicker = mediaPickerProp ? (
    <MediaLibraryModal
      opened
      onClose={() => setMediaPickerProp(null)}
      onSelect={handleMediaSelected}
      currentGuid={asString(draft[mediaPickerProp]) || undefined}
      zIndex={MEDIA_MODAL_Z_INDEX}
    />
  ) : null;

  /**
   * Montata solo con un `guid` non vuoto: il pulsante che apre questa modal (`PropField`,
   * ramo `mediaRef`) compare solo quando `guid` è già scritto, ma la bozza potrebbe cambiare
   * fra l'apertura e il render — niente da ritagliare senza un asset scelto (ADR-49).
   */
  const cropperGuid = cropperPickerProp ? asString(draft[cropperPickerProp]) : '';
  const mediaCropper =
    cropperPickerProp && cropperGuid ? (
      <MediaCropperModal
        opened
        guid={cropperGuid}
        onClose={() => setCropperPickerProp(null)}
        zIndex={MEDIA_MODAL_Z_INDEX}
      />
    ) : null;

  // Una scheda senza props non compare — mai una scheda vuota (ADR-30 § 1, ADR-37 § 5):
  // si passa `undefined` a `InspectorTabs`, mai un nodo per una sezione priva di campi.
  // Con una sola scheda popolata `InspectorTabs` monta direttamente il contenuto, senza
  // `Tabs` attorno (stesso invariante di prima dell'estrazione, vedi il suo commento di testa).
  return (
    <>
      <InspectorTabs
        content={content.length > 0 ? <ContentTab fields={content} {...tabProps} /> : undefined}
        style={style.length > 0 ? <StyleTab fields={style} {...tabProps} /> : undefined}
        advanced={advanced.length > 0 ? <AdvancedTab fields={advanced} {...tabProps} /> : undefined}
      />
      {mediaPicker}
      {mediaCropper}
    </>
  );
}

/** Pannello delle proprietà del blocco selezionato nel canvas. */
export default function PropertyInspector(): JSX.Element {
  const node = useSelectedNode();
  const generation = useTreeGeneration();
  const descriptor = node ? BLOCK_TYPES.find((entry) => entry.type === node.type) : undefined;
  // Selettori mirati (mai `useBlockEditorStore()` senza selettore, CLAUDE.md § dominio CMS):
  // solo le due azioni che servono al pulsante di ritorno, non l'intero store.
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const setActiveSidebarTab = useBlockEditorStore((state) => state.setActiveSidebarTab);

  /** Deseleziona il blocco e riporta la sidebar sulla scheda "Widgets" (switch esplicito
   *  Palette↔Ispettore, di ritorno rispetto a quello automatico fatto da `selectNode`). */
  function handleBackToWidgets(): void {
    selectNode(null);
    setActiveSidebarTab('widgets');
  }

  return (
    <div className={styles.root}>
      <Paper
        withBorder
        p="md"
        radius="md"
        className={styles.paper}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              {node && (
                <Tooltip label="Torna ai widget" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Torna ai widget"
                    onClick={handleBackToWidgets}
                  >
                    <IconArrowLeft size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Text fw={700} c="dark.8">Proprietà</Text>
            </Group>
            {descriptor && (
              <Badge variant="light" color="gray">
                {descriptor.meta?.label ?? descriptor.type}
              </Badge>
            )}
          </Group>

          {!node ? (
            <Text size="sm" c="dimmed">
              Seleziona un blocco nel canvas per modificarne le proprietà.
            </Text>
          ) : !descriptor ? (
            // Un tipo fuori registro non è raggiungibile dalla palette, ma può arrivare da un
            // contenuto salvato prima che il tipo venisse rimosso: si dice cosa succede invece
            // di mostrare un pannello vuoto.
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              Il tipo di blocco &laquo;{node.type}&raquo; non è nel registro: non è modificabile e il
              salvataggio verrà rifiutato finché il blocco resta nell&apos;albero.
            </Alert>
          ) : (
            <PropertyForm key={`${node.id}:${generation}`} node={node} descriptor={descriptor} />
          )}
        </Stack>
      </Paper>
    </div>
  );
}

/**
 * Chrome dell'editor attorno a un singolo nodo dell'albero (PLAN-F04-editor-visivo.md T4,
 * restyle Elementor Pro nel punto 4 di un task successivo): selezione, drag & drop
 * (dnd-kit), eliminazione ed inserimento posizionale.
 *
 * **Overlay hover/selezione unico (reversal esplicito e autorizzato, vedi il commento di
 * testa del blocco di render "Toolbar di selezione" più sotto).** Fra questo task e uno
 * precedente era esistita — poi deliberatamente rimossa — una barra di icone fissa per
 * ogni blocco (drag/duplica/elimina/modifica), sostituita da tre varianti di chrome
 * mutuamente esclusive per categoria (handle tab compatta delle Sezioni, badge informativo
 * dei contenitori, sola linguetta "Modifica" delle foglie). Il proprietario del progetto ha
 * chiesto e autorizzato consapevolmente di tornare a un overlay contestuale unico
 * (`BlockHoverOverlay.tsx`) con quei controlli (più "Seleziona genitore", aggiunto in un
 * round successivo) su **qualunque** blocco attivo — non
 * un'assunzione di questo file, una decisione presa altrove e qui solo implementata. "Sposta
 * su/giù" e "Sposta dentro/fuori dal contenitore" restano comunque raggiungibili solo dal
 * menu contestuale (`CanvasContextMenu.tsx`, tasto destro) — mai una seconda copia della
 * stessa azione nell'overlay.
 *
 * **Nessuna toolbar contestuale galleggiante (T-elementor-parity).** `InlineFormattingToolbar`/
 * `InlineFloatingToolbar` (barra ancorata H2-H6/Grassetto-Corsivo-Allinea-Link, montate su
 * `isSelected`/durante l'editing) sono state rimosse su richiesta esplicita del proprietario
 * del progetto, parità 1:1 con Elementor Pro: il click su un blocco testuale attiva solo il
 * bounding box di `BlockHoverOverlay` e i controlli completi nel `PropertyInspector`
 * (incluso `heading.level`, già un campo `enum` del tab Contenuto, `heading.block.ts`
 * `meta.props.level`) — l'editing nativo `contentEditable` resta l'unico modo di modificare
 * il testo direttamente sul canvas, senza sottomenù di formattazione.
 *
 * **Split hover/selezione (round successivo, F04d-02).** I due stati ora portano segnali
 * distinti, mai sovrapposti sullo stesso blocco: hover senza selezione mostra solo il
 * bordo di categoria (v. `overlayBorderClassName` sotto) più un badge nome in alto a
 * sinistra (`.hoverBadge`); la toolbar dei controlli è montata **solo** su `isSelected`.
 *
 * **Maniglia centrale (RE-2, restyle Elementor Pro).** La toolbar è tornata ad essere
 * ancorata in alto **al centro** del bordo superiore (`BlockHoverOverlay.module.css`),
 * non più in alto a destra come nel round F04d-02 sopra — richiesta esplicita del task:
 * le maniglie contestuali "posizionate in angolo" erano il deficit da correggere. Sette
 * controlli base oggi (era "sei", poi "cinque" quando questo commento fu scritto per la
 * prima volta): "+" (aggiungi sopra) e "+" speculare (aggiungi sotto) si aggiungono a
 * trascina/seleziona genitore/duplica/modifica/elimina, più i controlli opzionali (Salva
 * Preset/Converti in Sezione Globale/Esporta JSON) invariati.
 *

 * Ogni azione che cambia la struttura passa dallo store, che la verifica contro il
 * registro dei blocchi prima di applicarla: qui si decide solo se *offrirla* (es.
 * `canDropInto` per il drag & drop) — mai una regola scritta due volte.
 *
 * **Un solo renderer.** Il contenuto del blocco è renderizzato dai componenti di F02 T8,
 * invariati: `BlockRenderer` per le foglie. Per un contenitore la chrome deve inserirsi
 * *fra* il contenitore e i suoi figli (ogni figlio ha la propria toolbar), cosa che il
 * dispatcher ricorsivo non può fare dall'esterno: si riusa quindi lo **stesso** componente
 * di F02 (`CONTAINER_COMPONENTS`) passando i figli già avvolti. Nessun componente di blocco
 * viene riscritto qui: ciò che si vede nell'editor è ciò che pubblica il sito.
 *
 * Sottoscrizioni allo store: mirate per id (nodo, posizione fra i fratelli, id dei figli,
 * "sono io il selezionato?"). Nessun componente legge l'intero `tree` (NFR § Performance —
 * editor).
 *
 * **Overlay hover/selezione (PLAN-F04c-editor-maturo.md T8).** L'hover è promosso a stato
 * React locale (`isHovered`, mai Zustand: nessun altro componente lo consulta — verificato
 * su `EditorStructureNavigator.tsx`, che seleziona solo dal nome, non dal canvas — quindi
 * non è stato condiviso, CLAUDE.md § selettori mirati) invece di lasciarlo al solo CSS
 * `:hover`, che cascherebbe su ogni antenato del nodo puntato (il DOM di un figlio è
 * geometricamente dentro quello del padre). Gli handler usano **`onMouseOver`/`onMouseOut`**
 * (non `onMouseEnter`/`onMouseLeave`, che in React non attraversano mai il bubbling e per cui
 * `stopPropagation()` sarebbe un no-op): bubbling nativo + `stopPropagation()` sul nodo più
 * interno replica l'idioma già usato qui per il click-to-select, e garantisce che solo il
 * nodo effettivamente sotto il puntatore riceva lo stato "hovered".
 */
import {
  createContext,
  createElement,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import {
  useActiveViewport,
  useBlockEditorStore,
  useColumnResizeRatio,
  useContainerResizePercent,
  useIsHiddenInCanvas,
  useIsHoveredFromNavigator,
  useNodeById,
  type EditorViewport,
} from '../../../hooks/useBlockEditorStore';
import { findLocation, findNode, type BlockLocation, type BlockNode } from './block-tree.utils';
import { canDropInto } from './block-registry.utils';
import {
  containerWidthPercentFromPointer,
  formatContainerWidthBadge,
  readContainerWidthPercent,
  resolveContainerWidthSpec,
  resolveLayoutParentWidth,
  CONTAINER_WIDTH_PROP,
} from './container-resize.utils';
import {
  resolveColumnRatio,
  resolveColumnRatioFromFraction,
  type ColumnRatioValue,
} from './column-resize.utils';
import ContainerResizeHandle from './components/ContainerResizeHandle';
import ColumnResizer from './components/ColumnResizer';
import ResizeHandle from './ResizeHandle';
import { resolveResizePropSpec } from './resize-handle.utils';
import BlockRenderer from '../../../components/blocks/BlockRenderer';
import BlockErrorBoundary from '../../../components/blocks/BlockErrorBoundary';
import Section from '../../../components/blocks/blocks/Section';
import Container from '../../../components/blocks/blocks/Container';
import FormBlock from '../../../components/blocks/blocks/FormBlock';
import NavMenuBlock from '../../../components/blocks/blocks/NavMenuBlock';
import AccordionBlock from '../../../components/blocks/blocks/AccordionBlock';
import AccordionItemBlock from '../../../components/blocks/blocks/AccordionItemBlock';
import TabsBlock from '../../../components/blocks/blocks/TabsBlock';
import TabPanelBlock from '../../../components/blocks/blocks/TabPanelBlock';
import CarouselBlock, {
  resolveCarouselTransition,
} from '../../../components/blocks/blocks/CarouselBlock';
import CarouselSlideBlock from '../../../components/blocks/blocks/CarouselSlideBlock';
import ModalTriggerBlock from '../../../components/blocks/blocks/ModalTriggerBlock';
import GalleryBlock from '../../../components/blocks/blocks/GalleryBlock';
import tokenStyles from '../../../components/blocks/style-tokens.module.css';
import {
  resolveHideClassName,
  resolveResponsiveClassNames,
} from '../../../components/blocks/style-tokens';
import ConfirmModal from '../../../components/ConfirmModal';
import BlockPalette, { blockIcon } from './BlockPalette';
import BlockHoverOverlay from './components/BlockHoverOverlay';
import { usePresetStore } from './usePresetStore';
import { exportSubtreeToJson } from './utils/template-io.utils';
import ConvertToGlobalSectionModal from './ConvertToGlobalSectionModal';
import styles from './EditorBlockWrapper.module.css';

const CONTAINER_WIDTH_SPEC = resolveContainerWidthSpec();

interface SectionContainerProps {
  children: ReactNode;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  stylePadding?: unknown;
  styleBackground?: unknown;
  columns?: unknown;
  gap?: unknown;
  alignItems?: unknown;
  /** ADR-39, allineamento orizzontale dei figli — stesso schema `container`. */
  justifyContent?: unknown;
  contentWidth?: unknown;
  maxWidth?: unknown;
  columnRatio?: unknown;
  styleBackgroundColor?: unknown;
  styleColor?: unknown;
  stylePaddingTop?: unknown;
  stylePaddingRight?: unknown;
  stylePaddingBottom?: unknown;
  stylePaddingLeft?: unknown;
  styleMarginTop?: unknown;
  styleMarginRight?: unknown;
  styleMarginBottom?: unknown;
  styleMarginLeft?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
}

/**
 * Props del blocco `container` `v: 2` (ADR-82-container-unificato-grid-flex.md): solo ciò che
 * `Container.tsx` rende direttamente (`tag`, le poche prop scalari semplici, `htmlId`/
 * `cssClass`) — il layout Flex/Grid, la spaziatura, il bordo/raggio/ombra/sfondo/posizione/
 * trasformazione/filtro sono valori liberi PropKind v2, resi dal Runtime Style Bridge
 * (`generateCanvasCss.ts`), mai passati come prop a questo componente (vedi il commento di
 * testa di `Container.tsx`). `id` è il `node.id` strutturale, obbligatorio.
 */
interface ContainerBlockProps {
  id?: string;
  children: ReactNode;
  tag?: unknown;
  contentWidth?: unknown;
  boxedWidth?: unknown;
  minHeight?: unknown;
  overflow?: unknown;
  opacity?: unknown;
  htmlId?: unknown;
  cssClass?: unknown;
}

/**
 * Props del blocco `gallery` (`PLAN-parita-elementor-pro.md` § R4): stesso principio di
 * {@link ContainerBlockProps} — `layout` (identico `kind: 'layout'` di `container` v2, ADR-82)
 * non è passato come prop (Runtime Style Bridge via `id`), solo ciò che `GalleryBlock.tsx`
 * rende direttamente (`galleryMode`/`lightbox`/`customCssClass`/`customElementId`). Nessuna
 * prop derivata dal genitore (a differenza dei sette widget compositi ADR-57 § 2 sotto): i
 * figli `image` non hanno bisogno di alcuna informazione di gruppo, stesso principio di
 * `container`.
 */
interface GalleryBlockContainerProps {
  id?: string;
  children: ReactNode;
  galleryMode?: unknown;
  lightbox?: unknown;
  customCssClass?: unknown;
  customElementId?: unknown;
}

/**
 * Props del blocco `form` (ADR-46 § 1, RFC-46 D1): unica prop dichiarata dal registro,
 * `formKey` — nessuna prop di stile (ADR-46 § Conformità).
 */
interface FormBlockContainerProps {
  children: ReactNode;
  formKey?: unknown;
}

/**
 * Props del blocco `navMenu` (ADR-52 § 1): nessuna prop propria dichiarata dal registro
 * (`props: []`), solo `children` — i figli `navMenuItem` si montano come ogni altra foglia
 * (vedi il ramo `isContainer` false più sotto), risolvendo il proprio `pageGuid` via
 * `usePublicPageUrl` client-side, mai via `resolvePageUrl` (quello esiste solo lato SSR
 * pubblico, `BlockRenderer.tsx`).
 */
interface NavMenuContainerProps {
  children: ReactNode;
}

/**
 * Props dei sette widget compositi CSS-only (ADR-57 § 2, ADR-59): a differenza di
 * `section`/`container`/`form`/`navMenu` sopra, i componenti puri di `accordionItem`/
 * `tabPanel`/`carousel`/`carouselSlide`/`modalTrigger` dichiarano props strutturali
 * **obbligatorie** e tipizzate in modo stretto (`title: string`, `groupName: string`,
 * `transition: CarouselEffectiveTransition`, ecc. — mai `unknown`), perché sono componenti
 * "puri" condivisi con `BlockRenderer.tsx`/il sito pubblico, non riscritti qui (CLAUDE.md §
 * confine Mantine/blocchi, invariati bit-per-bit da questo task). Queste interfacce restano
 * invece nello stesso stile "largo" di ogni altra voce di `CONTAINER_COMPONENTS` sopra
 * (solo `children` obbligatoria, il resto opzionale/`unknown`) — un piccolo componente
 * adapter per ciascuna (sotto) restringe i valori all'ultimo istante, con la stessa identica
 * logica difensiva già scritta in `BlockRenderer.tsx` (mai una seconda regola divergente):
 * qui la narrowing serve solo a soddisfare la forma del `Record` sotto, il *valore* è già
 * stato derivato correttamente da {@link resolveContainerComponentProps}. `accordion`/`tabs`
 * non compaiono qui: i loro componenti puri accettano solo un `children` opzionale, già
 * strutturalmente compatibili con l'unione senza bisogno di un adapter.
 */
interface AccordionItemContainerProps {
  children: ReactNode;
  title?: unknown;
  groupName?: unknown;
}

interface TabPanelContainerProps {
  children: ReactNode;
  label?: unknown;
  groupName?: unknown;
  defaultChecked?: unknown;
}

interface CarouselContainerProps {
  children: ReactNode;
  transition?: unknown;
}

interface CarouselSlideContainerProps {
  children: ReactNode;
  slideId?: unknown;
  transition?: unknown;
  index?: unknown;
  count?: unknown;
}

interface ModalTriggerContainerProps {
  children: ReactNode;
  nodeId?: unknown;
  triggerLabel?: unknown;
  animation?: unknown;
}

/** Adapter di `accordionItem` verso `AccordionItemBlock` (vedi il commento sopra {@link AccordionItemContainerProps}). */
function AccordionItemContainer({
  children,
  title,
  groupName,
}: AccordionItemContainerProps): JSX.Element {
  return (
    <AccordionItemBlock
      title={typeof title === 'string' ? title : ''}
      groupName={typeof groupName === 'string' ? groupName : undefined}
    >
      {children}
    </AccordionItemBlock>
  );
}

/** Adapter di `tabPanel` verso `TabPanelBlock` (vedi il commento sopra {@link TabPanelContainerProps}). */
function TabPanelContainer({
  children,
  label,
  groupName,
  defaultChecked,
}: TabPanelContainerProps): JSX.Element {
  return (
    <TabPanelBlock
      label={typeof label === 'string' ? label : ''}
      groupName={typeof groupName === 'string' ? groupName : ''}
      defaultChecked={defaultChecked === true}
    >
      {children}
    </TabPanelBlock>
  );
}

/** Adapter di `carousel` verso `CarouselBlock` (vedi il commento sopra {@link CarouselContainerProps}). */
function CarouselContainer({ children, transition }: CarouselContainerProps): JSX.Element {
  return (
    <CarouselBlock
      transition={
        transition === 'fade-loop' || transition === 'slide-loop' ? transition : 'manual-scroll'
      }
    >
      {children}
    </CarouselBlock>
  );
}

/** Adapter di `carouselSlide` verso `CarouselSlideBlock` (vedi il commento sopra {@link CarouselSlideContainerProps}). */
function CarouselSlideContainer({
  children,
  slideId,
  transition,
  index,
  count,
}: CarouselSlideContainerProps): JSX.Element {
  return (
    <CarouselSlideBlock
      slideId={typeof slideId === 'string' ? slideId : ''}
      transition={
        transition === 'fade-loop' || transition === 'slide-loop' ? transition : 'manual-scroll'
      }
      index={typeof index === 'number' ? index : 0}
      count={typeof count === 'number' ? count : 1}
    >
      {children}
    </CarouselSlideBlock>
  );
}

/** Adapter di `modalTrigger` verso `ModalTriggerBlock` (vedi il commento sopra {@link ModalTriggerContainerProps}). */
function ModalTriggerContainer({
  children,
  nodeId,
  triggerLabel,
  animation,
}: ModalTriggerContainerProps): JSX.Element {
  return (
    <ModalTriggerBlock
      nodeId={typeof nodeId === 'string' ? nodeId : ''}
      triggerLabel={typeof triggerLabel === 'string' ? triggerLabel : ''}
      animation={animation === 'none' || animation === 'slide-down' ? animation : 'fade'}
    >
      {children}
    </ModalTriggerBlock>
  );
}

/**
 * Unione delle props ammesse da un componente montato in `CONTAINER_COMPONENTS`: ogni
 * tipo contenitore del registro dichiara il proprio schema — `section`, `container`
 * (ADR-39), `form` (ADR-46), `navMenu` (ADR-52) e i sette widget compositi CSS-only
 * (ADR-57 § 2, ADR-59: `accordion`/`accordionItem`/`tabs`/`tabPanel`/`carousel`/
 * `carouselSlide`/`modalTrigger`). Tutte le interfacce dichiarano solo `children` come
 * obbligatoria e ogni altra prop opzionale (`unknown`): strutturalmente compatibili con
 * l'unione, senza bisogno di `any` per tipizzare il record qui sotto.
 */
type ContainerComponentProps =
  | SectionContainerProps
  | ContainerBlockProps
  | GalleryBlockContainerProps
  | FormBlockContainerProps
  | NavMenuContainerProps
  | AccordionItemContainerProps
  | TabPanelContainerProps
  | CarouselContainerProps
  | CarouselSlideContainerProps
  | ModalTriggerContainerProps;

/**
 * Ricorsione dei figli dei sette widget compositi (ADR-59): non più `BlockRenderer.tsx`
 * (unico dispatcher per `app/public-site`, invariato) ma questo stesso componente, come già
 * avviene per `section`/`container`/`form`/`navMenu` sopra — un `EditorBlockWrapper` per
 * ogni figlio, con la propria chrome (selezione/drag/eliminazione) indipendentemente da
 * quanto in profondità si trovi nell'albero.
 */
const CONTAINER_COMPONENTS: Record<string, (props: ContainerComponentProps) => JSX.Element> = {
  section: Section,
  container: Container,
  gallery: GalleryBlock,
  form: FormBlock,
  navMenu: NavMenuBlock,
  accordion: AccordionBlock,
  accordionItem: AccordionItemContainer,
  tabs: TabsBlock,
  tabPanel: TabPanelContainer,
  carousel: CarouselContainer,
  carouselSlide: CarouselSlideContainer,
  modalTrigger: ModalTriggerContainer,
};

/** Posizione di un nodo (`BlockLocation`) più il tipo del genitore — stessa forma calcolata da `location` nel corpo del componente più sotto. */
interface NodeLocationWithParentType extends BlockLocation {
  parentType: string | undefined;
}

/**
 * Props del genitore rilevanti solo per i tre "item" dei widget compositi (ADR-59,
 * `accordionItem`/`tabPanel`/`carouselSlide`): `exclusive` (accordion), `autoplay`/
 * `transition` (carousel) — mai l'intero oggetto props del genitore, per non far
 * ri-renderizzare l'item ad ogni modifica di una prop del genitore che non gli interessa
 * (vedi il selettore Zustand dedicato nel corpo del componente, `parentCompositeProps`).
 */
interface WidgetParentCompositeProps {
  exclusive?: unknown;
  autoplay?: unknown;
  transition?: unknown;
}

/**
 * Props da passare al componente di contenuto quando il nodo è un contenitore
 * (`CONTAINER_COMPONENTS`): ogni tipo ha il proprio insieme di props di registro,
 * incompatibili l'uno con l'altro (`section` è layout a colonne/stile, `container` è
 * layout flex puro, ADR-39) — mai un solo oggetto condiviso passato a entrambi.
 *
 * `location`/`parentCompositeProps` servono solo ai sette widget compositi (ADR-57 § 2,
 * ADR-59): `BlockRenderer.tsx` calcola `groupName`/`exclusive`/`defaultChecked`/
 * `transition`/`index`/`count` da dentro il `case` del genitore, che possiede l'intero
 * gruppo di fratelli in un colpo solo — qui ogni nodo è un `EditorBlockWrapper`
 * indipendente montato per `id`, quindi la stessa informazione va derivata guardando lo
 * store (nodo genitore + posizione fra i fratelli) invece che ricevuta da un genitore JSX.
 * Stessa identica logica di calcolo di `BlockRenderer.tsx`, mai divergente.
 */
function resolveContainerComponentProps(
  node: BlockNode,
  location: NodeLocationWithParentType,
  parentCompositeProps: WidgetParentCompositeProps | undefined,
):
  | Omit<SectionContainerProps, 'children'>
  | Omit<ContainerBlockProps, 'children'>
  | Omit<GalleryBlockContainerProps, 'children'>
  | Omit<FormBlockContainerProps, 'children'>
  | Omit<NavMenuContainerProps, 'children'>
  | Omit<AccordionItemContainerProps, 'children'>
  | Omit<TabPanelContainerProps, 'children'>
  | Omit<CarouselContainerProps, 'children'>
  | Omit<CarouselSlideContainerProps, 'children'>
  | Omit<ModalTriggerContainerProps, 'children'> {
  if (node.type === 'navMenu') {
    // Nessuna prop propria (vedi {@link NavMenuContainerProps}).
    return {};
  }
  if (node.type === 'container') {
    // `container` v2 (ADR-82): layout Flex/Grid, spaziatura, bordo/raggio/ombra/sfondo/
    // posizione/trasformazione/filtro non sono più letti qui — sono valori liberi PropKind v2
    // resi dal Runtime Style Bridge (`generateCanvasCss.ts`) via `data-canvas-style-id`, non
    // da una prop passata al componente (vedi il commento di testa di `Container.tsx`). `id`
    // è il `node.id` strutturale, il bersaglio di quell'attributo.
    return {
      id: node.id,
      tag: node.props.tag,
      contentWidth: node.props.contentWidth,
      boxedWidth: node.props.boxedWidth,
      minHeight: node.props.minHeight,
      overflow: node.props.overflow,
      opacity: node.props.opacity,
      htmlId: node.props.htmlId,
      cssClass: node.props.cssClass,
    };
  }
  if (node.type === 'gallery') {
    // Stesso principio del ramo `container` sopra: `layout` non è passato come prop (Runtime
    // Style Bridge via `id`), solo le poche prop scalari semplici rese direttamente da
    // `GalleryBlock.tsx`. Nessuna prop derivata dal genitore/dai fratelli.
    return {
      id: node.id,
      galleryMode: node.props.galleryMode,
      lightbox: node.props.lightbox,
      customCssClass: node.props.customCssClass,
      customElementId: node.props.customElementId,
    };
  }
  if (node.type === 'form') {
    return {
      formKey: node.props.formKey,
    };
  }
  if (node.type === 'accordion' || node.type === 'tabs') {
    // Wrapper puri (ADR-57 § 2): nessuna prop propria — `exclusive`/il raggruppamento
    // vivono sui figli, ciascuno li deriva guardando questo stesso genitore (vedi i due
    // case sotto), mai passati in giù da qui.
    return {};
  }
  if (node.type === 'accordionItem') {
    // Stessa regola di `BlockRenderer.tsx` case `'accordion'`/`'accordionItem'`: `groupName`
    // solo se il genitore è davvero un `accordion` con `exclusive:true` — un `accordionItem`
    // raggiunto isolato (contenuto malformato/legacy, o genitore diverso) non riceve alcun
    // `groupName`, stessa resa "difensiva" del dispatcher pubblico.
    const parentIsAccordion = location.parentType === 'accordion';
    const exclusive = parentIsAccordion && parentCompositeProps?.exclusive === true;
    return {
      title: node.props.title,
      groupName: exclusive ? `accordion-${location.parentId}` : undefined,
    };
  }
  if (node.type === 'tabPanel') {
    // Stessa regola di `BlockRenderer.tsx` case `'tabs'`/`'tabPanel'`: `groupName`
    // condiviso e `defaultChecked` solo sul primo pannello quando il genitore è davvero
    // `tabs`; un `tabPanel` isolato riceve un `groupName` tutto suo e resta sempre aperto
    // (difensivo).
    const parentIsTabs = location.parentType === 'tabs';
    return {
      label: node.props.label,
      groupName: parentIsTabs ? `tabs-${location.parentId}` : `tabpanel-${node.id}`,
      defaultChecked: parentIsTabs ? location.index === 0 : true,
    };
  }
  if (node.type === 'carousel') {
    return {
      transition: resolveCarouselTransition(node.props.autoplay, node.props.transition),
    };
  }
  if (node.type === 'carouselSlide') {
    // Stessa regola di `BlockRenderer.tsx` case `'carousel'`/`'carouselSlide'`: `transition`
    // effettiva del genitore (mai ricalcolata dalle proprie props — una slide non dichiara
    // né `autoplay` né `transition`), `index`/`count` dalla posizione fra i fratelli.
    // Isolata (difensivo): nessun genitore `carousel` noto, resa come singola slide statica.
    const parentIsCarousel = location.parentType === 'carousel';
    return {
      slideId: node.id,
      transition: parentIsCarousel
        ? resolveCarouselTransition(
            parentCompositeProps?.autoplay,
            parentCompositeProps?.transition,
          )
        : 'manual-scroll',
      index: parentIsCarousel ? location.index : 0,
      count: parentIsCarousel ? location.siblingsCount : 1,
    };
  }
  if (node.type === 'modalTrigger') {
    return {
      nodeId: node.id,
      triggerLabel: node.props.triggerLabel,
      animation: node.props.animation,
    };
  }
  return {
    styleSpaceBefore: node.props.styleSpaceBefore,
    styleSpaceAfter: node.props.styleSpaceAfter,
    stylePadding: node.props.stylePadding,
    styleBackground: node.props.styleBackground,
    columns: node.props.columns,
    gap: node.props.gap,
    alignItems: node.props.alignItems,
    justifyContent: node.props.justifyContent,
    contentWidth: node.props.contentWidth,
    maxWidth: node.props.maxWidth,
    columnRatio: node.props.columnRatio,
    styleBackgroundColor: node.props.styleBackgroundColor,
    styleColor: node.props.styleColor,
    stylePaddingTop: node.props.stylePaddingTop,
    stylePaddingRight: node.props.stylePaddingRight,
    stylePaddingBottom: node.props.stylePaddingBottom,
    stylePaddingLeft: node.props.stylePaddingLeft,
    styleMarginTop: node.props.styleMarginTop,
    styleMarginRight: node.props.styleMarginRight,
    styleMarginBottom: node.props.styleMarginBottom,
    styleMarginLeft: node.props.styleMarginLeft,
    styleLayer: node.props.styleLayer,
    styleHideDesktop: node.props.styleHideDesktop,
    styleHideTablet: node.props.styleHideTablet,
    styleHideMobile: node.props.styleHideMobile,
  };
}

/**
 * Nome della prop di visibilità (ADR-37 § 3) per ciascun viewport del Device Switcher
 * (`FullScreenEditorLayout.tsx`, `EditorViewport`), ed etichetta italiana per il badge —
 * stessa formulazione di `blocks.types.ts` § meta.props (`Nascondi su Desktop/Tablet/
 * Mobile`), coniugata al participio per il messaggio del Canvas.
 */
const VIEWPORT_HIDE_PROP: Record<
  EditorViewport,
  'styleHideDesktop' | 'styleHideTablet' | 'styleHideMobile'
> = {
  desktop: 'styleHideDesktop',
  tablet: 'styleHideTablet',
  mobile: 'styleHideMobile',
};
const VIEWPORT_LABEL: Record<EditorViewport, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/** Millisecondi di inattività prima che un `onTextInput`/`onHtmlInput`/`onLabelInput` raggiunga lo store (punto 1 del task). */
const EDIT_DEBOUNCE_MS = 300;

/**
 * I tre "item" dei widget compositi (ADR-57 § 2, ADR-59) che hanno bisogno di leggere
 * props del proprio genitore (`parentCompositeProps`, vedi il selettore dedicato nel corpo
 * del componente) — `accordion`/`tabs`/`carousel` stessi non ne fanno parte: sono loro il
 * genitore, non il figlio che lo consulta.
 */
const WIDGET_ITEM_TYPES = new Set(['accordionItem', 'tabPanel', 'carouselSlide']);

/** Id del nodo respinto dall'ultima validazione server-side, o `null`. */
const InvalidBlockContext = createContext<string | null>(null);

/** Rende disponibile a tutta la chrome il nodo colpevole dell'ultimo `400` di validazione. */
export function InvalidBlockProvider({
  invalidBlockId,
  children,
}: {
  invalidBlockId: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <InvalidBlockContext.Provider value={invalidBlockId}>{children}</InvalidBlockContext.Provider>
  );
}

/**
 * Valore scalare effettivo di una prop responsive (`{ default, tablet?, mobile? }`, ADR-29)
 * al viewport indicato — solo la logica di fallback di `resolveResponsiveClassNames`
 * (`style-tokens.ts`), non la generazione di classi CSS: qui serve leggere il valore vero
 * per decidere *se* mostrare il resizer di colonne (punto 1 del task), non per disegnarlo.
 * Cascata `mobile → tablet → default`: un breakpoint senza valore proprio eredita quello
 * del breakpoint meno specifico immediatamente sopra, mai un errore silenzioso.
 */
function resolveEffectiveResponsiveValue(
  value: unknown,
  viewport: EditorViewport,
): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const envelope = value as Record<string, unknown>;
  if (viewport === 'mobile' && typeof envelope.mobile === 'string') return envelope.mobile;
  if (viewport !== 'desktop' && typeof envelope.tablet === 'string') return envelope.tablet;
  return typeof envelope.default === 'string' ? envelope.default : undefined;
}

interface EditorBlockWrapperProps {
  id: string;
}

/**
 * Attributi `data-*` di una zona di rilascio (dnd-kit T7): se il puntatore ci sta sopra
 * durante un trascinamento (`isOver`), e se quel drop sarebbe ammesso — letto con
 * `canDropInto` sull'albero corrente (`getState().tree`, non una sottoscrizione: durante
 * l'hover l'albero non cambia, è il solo `isOver`/`active` di dnd-kit a farlo, quindi non
 * serve un re-render pilotato dallo store per questo calcolo). I tre segni di rilascio
 * (linea, evidenziazione, rifiuto) sono tutti CSS su questi due attributi.
 */
function dropZoneAttrs(
  isOver: boolean,
  activeDragId: string | null,
  activeDragType: string | undefined,
  targetParentId: string | null,
): { 'data-over': boolean; 'data-rejected': boolean } {
  const rejected =
    isOver && activeDragId !== null
      ? !canDropInto(
          useBlockEditorStore.getState().tree,
          activeDragId,
          targetParentId,
          activeDragType,
        )
      : false;
  return { 'data-over': isOver, 'data-rejected': rejected };
}

interface ColumnDropTargetProps {
  parentId: string;
  columnIndex: number;
  columnCount: number;
  activeDragId: string | null;
  activeDragType: string | undefined;
}

/** Bersaglio visibile per inserire un blocco nella singola colonna di una Section. */
function ColumnDropTarget({
  parentId,
  columnIndex,
  columnCount,
  activeDragId,
  activeDragType,
}: ColumnDropTargetProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-column:${parentId}:${columnIndex}`,
    data: { parentId, index: columnIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.columnDropTarget}
      style={{ left: `${(columnIndex * 100) / columnCount}%`, width: `${100 / columnCount}%` }}
      {...dropZoneAttrs(isOver, activeDragId, activeDragType, parentId)}
      aria-label={`Drop target Colonna ${columnIndex + 1}`}
    />
  );
}

const EditorBlockWrapper = memo(function EditorBlockWrapper({
  id,
}: EditorBlockWrapperProps): JSX.Element | null {
  const node = useNodeById(id);
  /**
   * Posizione del nodo, con in più il **tipo** del genitore (`parentType`, `undefined`
   * alla radice): stesso `findLocation` di sempre, arricchito qui perché il primo
   * controllo "+" della toolbar di selezione (`BlockHoverOverlay.tsx`, RE-2) deve filtrare
   * i tipi ammessi da `BlockPalette` sul contenitore di destinazione — la stessa
   * informazione che `resolveContainerComponentProps` già ricava altrove per il nodo
   * stesso, qui serve per il suo genitore. Un solo selettore Zustand mirato per id, non
   * due sottoscrizioni separate.
   */
  const location = useBlockEditorStore(
    useShallow((state) => {
      const found = findLocation(state.tree, id);
      if (!found) return undefined;
      const parentType = found.parentId ? findNode(state.tree, found.parentId)?.type : undefined;
      return { ...found, parentType };
    }),
  );
  const childIds = useBlockEditorStore(
    useShallow((state) => findNode(state.tree, id)?.children.map((child) => child.id) ?? []),
  );
  /**
   * Props del genitore rilevanti solo per i tre "item" dei widget compositi (ADR-59,
   * {@link WIDGET_ITEM_TYPES}): `exclusive`/`autoplay`/`transition` — mai l'intero oggetto
   * props del genitore (una modifica a una prop del genitore estranea a queste tre, es. lo
   * sfondo di un `container`, non deve ri-renderizzare questo nodo figlio). `undefined` per
   * ogni altro tipo di nodo: nessuna sottoscrizione utile da mantenere.
   */
  const parentCompositeProps = useBlockEditorStore(
    useShallow((state) => {
      if (!node || !WIDGET_ITEM_TYPES.has(node.type) || !location?.parentId) return undefined;
      const parent = findNode(state.tree, location.parentId);
      if (!parent) return undefined;
      return {
        exclusive: parent.props.exclusive,
        autoplay: parent.props.autoplay,
        transition: parent.props.transition,
      };
    }),
  );
  const isSelected = useBlockEditorStore((state) => state.selectedId === id);
  const isInvalid = useContext(InvalidBlockContext) === id;
  const activeViewport = useActiveViewport();
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const setContainerResizePreview = useBlockEditorStore((state) => state.setContainerResizePreview);
  const clearContainerResizePreview = useBlockEditorStore(
    (state) => state.clearContainerResizePreview,
  );
  const commitContainerWidthAction = useBlockEditorStore(
    (state) => state.commitContainerWidthAction,
  );
  const setColumnResizePreview = useBlockEditorStore((state) => state.setColumnResizePreview);
  const clearColumnResizePreview = useBlockEditorStore((state) => state.clearColumnResizePreview);
  const commitColumnRatioAction = useBlockEditorStore((state) => state.commitColumnRatioAction);
  /** "Salva come Preset Globale" (F14-01): stesso `usePresetStore` già usato da `AdvancedTab.tsx` per container/section — nessun secondo registro di preset. */
  const savePreset = usePresetStore((state) => state.savePreset);
  /** "Converti in Sezione Globale" (ADR-55): unica azione, nessuna duplicazione con `AdvancedTab.tsx` (stesso store, stesso `ConvertToGlobalSectionModal.tsx`). */
  const convertToGlobalSectionAction = useBlockEditorStore(
    (state) => state.convertToGlobalSectionAction,
  );
  /** "Occhio" del pannello Struttura/Navigator (`EditorStructureNavigator.tsx`): nascosto solo qui nel canvas, mai persistito. */
  const isHiddenInCanvas = useIsHiddenInCanvas(id);
  /** Riga corrispondente sotto il puntatore nel pannello Struttura/Navigator — stesso trattamento visivo dell'hover nel canvas. */
  const isHoveredFromNavigator = useIsHoveredFromNavigator(id);

  const [confirmOpened, setConfirmOpened] = useState(false);
  /** Modal "Salva come Preset Globale" (F14-01), aperto dal sesto controllo di `BlockHoverOverlay.tsx` — solo su `section` (vedi `isSaveAsPresetOffered` più sotto). */
  const [presetModalOpened, setPresetModalOpened] = useState(false);
  const [presetName, setPresetName] = useState('');
  /** Modal "Converti in Sezione Globale" (ADR-55), aperto dal settimo controllo di `BlockHoverOverlay.tsx` — solo su un contenitore/`section` di primo livello (vedi `isTopLevelContainerOrSection` più sotto). */
  const [convertModalOpened, setConvertModalOpened] = useState(false);
  /** Solo il nodo direttamente sotto il puntatore (vedi commento di testa). */
  const [isHovered, setIsHovered] = useState(false);

  /**
   * Apertura visiva del pannello `modalTrigger` nel Canvas (ADR-59 § 2): mai `location.hash`
   * — il Canvas gira in `BrowserRouter` reale (`main.tsx`), non `HashRouter`/iframe, quindi
   * lasciare che il click sul trigger navighi davvero verso `#modal-{id}` altererebbe
   * `location.hash`/la cronologia della vera URL admin. Stato locale React, mai Zustand
   * (effimero, mai su undo/redo — stesso principio di `hiddenInCanvasIds`/`hoveredBlockId`,
   * `useBlockEditorStore.ts`): resettato implicitamente a `false` ad ogni nuovo mount (questo
   * componente è già rimontato per `key={childId}` ad ogni cambio di nodo, mai riusato fra id
   * diversi). Letto solo per `node.type === 'modalTrigger'` (vedi `data-modal-open` e
   * {@link handleModalTriggerAnchorClick} più sotto), ignorato per ogni altro tipo.
   */
  const [isModalTriggerOpen, setIsModalTriggerOpen] = useState(false);

  /**
   * Anti-clipping della toolbar di selezione (`BlockHoverOverlay.tsx`, ancorata a
   * `top: -14px`, cioè sopra il bordo superiore del blocco): `true` quando quel bordo è
   * troppo vicino al confine scrollabile reale del canvas (`[data-canvas-scroll-area]`,
   * `FullScreenEditorLayout.tsx`) perché la toolbar ci stia sopra senza finire tagliata da
   * quell'`overflow-y: auto` — tipicamente il primo blocco della pagina, appena sotto la
   * Topbar. In quel caso `BlockHoverOverlay.tsx` si riancora **dentro** il margine
   * superiore del blocco (`.overlayInside`) invece che fuori, mai un secondo modal/overlay.
   */
  const [overlayAnchoredInside, setOverlayAnchoredInside] = useState(false);

  /**
   * Debounce (punto 1 del task) per `onTextInput`/`onHtmlInput`/`onLabelInput`: il DOM
   * resta l'unica fonte di verità mentre si digita (invariato, vedi `Heading.tsx`), ma lo
   * store riceve comunque un `updateBlockPropsAction` dopo {@link EDIT_DEBOUNCE_MS}ms di
   * inattività, così l'undo stack e ogni altro consumatore dello store non restano indietro
   * di un intero paragrafo. `useRef`, non `useDebouncedCallback` di `@mantine/hooks`: le sue
   * semantiche di cancel/flush non sono verificate in questo codebase, un timer manuale è
   * sotto controllo diretto (vedi nota di contesto del task).
   */
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Nodo DOM del wrapper (punto 2 del task, disaccoppiamento drag/testo): stesso elemento
   * di `setDragRef` sotto (dnd-kit), letto qui in più per verificare, in `onFocus`/`onBlur`,
   * se il focus è dentro un discendente in editing.
   */
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  /**
   * `true` mentre il focus è dentro un discendente `contentEditable` di questo nodo (punto
   * 2 del task): disabilita il drag dello stesso nodo (`useDraggable({ disabled })` sotto)
   * finché dura, così un trascinamento accidentale non interrompe una selezione di testo
   * in corso. `onFocus`/`onBlur` bubbling nativo (React 17+): risale anche dai contenitori
   * che ospitano un figlio in editing, disabilitando anche il loro drag — conservativo per
   * costruzione, mai un buco di sicurezza nell'altro verso.
   */
  const [isEditingText, setIsEditingText] = useState(false);

  /**
   * Dati del gesto in corso sul resizer inter-colonna, mai in Zustand: `containerEl` (il
   * DOM della `<section>`, misurato una volta sola al `pointerdown`) e `lastRatio` (lo stop
   * committato al rilascio) vivono in un ref e non in uno stato React perché cambiano ad
   * ogni `pointermove` — un re-render per pixel spostato qui non serve, l'anteprima visiva
   * passa dallo store ({@link setColumnResizePreview}), che già filtra i valori invariati.
   * `lastRatio` è anche ciò che evita `setColumnResizePreview` ridondanti quando il
   * puntatore si muove dentro la stessa zona di snap, stesso principio di
   * `widthResizeRef.lastPercent` sotto.
   */
  const columnResizeRef = useRef<{ containerEl: HTMLElement; lastRatio: ColumnRatioValue } | null>(
    null,
  );

  /**
   * `true` mentre la maniglia inter-colonna di questa `section` è sotto trascinamento:
   * disabilita il drag dnd-kit dello stesso nodo (`useDraggable({ disabled })` sotto), stesso
   * principio e stessa ragione di {@link isResizingWidth} due righe sotto (E03, punto 2) —
   * lo stesso `pointermove` non deve poter essere interpretato dal `PointerSensor` del
   * `DndContext` come l'inizio di uno spostamento dell'intera section.
   */
  const [isResizingColumns, setIsResizingColumns] = useState(false);

  /**
   * `true` mentre la maniglia di ridimensionamento di questo `container` è sotto
   * trascinamento (E03, punto 2): disabilita il drag dnd-kit dello stesso nodo
   * (`useDraggable({ disabled })` sotto), altrimenti il `PointerSensor` del `DndContext`
   * interpreterebbe lo stesso `pointermove` come l'inizio di uno spostamento del blocco e
   * il container partirebbe dietro al puntatore invece di allargarsi. Stato React e non
   * `useRef` proprio perché `useDraggable` deve vederlo cambiare: due render per gesto
   * (inizio e fine), non uno per pixel.
   */
  const [isResizingWidth, setIsResizingWidth] = useState(false);

  /**
   * Dati del gesto di ridimensionamento in corso, mai in Zustand: `originLeft` (bordo
   * sinistro del nodo al `pointerdown`, fisso per tutta la durata — un `justifyContent`
   * centrato lo farebbe altrimenti scivolare sotto le dita) e `parentWidth` (larghezza del
   * contenitore padre) si misurano una volta sola all'inizio, non ad ogni `pointermove`:
   * un `getBoundingClientRect()` per pixel forzerebbe un reflow sincrono ad ogni evento.
   * `lastPercent` è ciò che verrà committato al rilascio.
   */
  const widthResizeRef = useRef<{
    originLeft: number;
    parentWidth: number;
    lastPercent: number;
  } | null>(null);

  /** Cancella un dispatch debounced in sospeso, se c'è (blur, deselezione, unmount). */
  function cancelDebouncedUpdate(): void {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  /** Rimanda un `updateBlockPropsAction` a dopo {@link EDIT_DEBOUNCE_MS}ms di inattività. */
  function scheduleDebouncedUpdate(props: Record<string, unknown>): void {
    cancelDebouncedUpdate();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      updateBlockPropsAction(id, props);
    }, EDIT_DEBOUNCE_MS);
  }

  /**
   * Commit immediato di `html` (`richText`): stessa funzione dietro `onHtmlChange` (blur),
   * mai un tasto da debounced.
   */
  function commitHtml(nextHtml: string): void {
    cancelDebouncedUpdate();
    updateBlockPropsAction(id, { html: nextHtml });
  }

  // Il timer in sospeso non deve mai sparare contro un nodo deselezionato o smontato: sia
  // il cambio di `id` sia il flip di `isSelected` (l'`editing` passato a `BlockRenderer`
  // diventa `undefined`) rieseguono questo effetto, la cui funzione di cleanup cancella il
  // timer del giro precedente — lo stesso percorso copre anche lo smontaggio.
  useEffect(() => {
    return () => cancelDebouncedUpdate();
  }, [id, isSelected]);

  // Anti-clipping della toolbar di selezione (vedi il commento di {@link
  // overlayAnchoredInside} sopra): ricalcolato solo mentre il blocco è selezionato (la
  // toolbar non è montata altrimenti), alla selezione, allo scroll del canvas e al resize
  // della finestra — mai un timer, i tre eventi bastano a coprire ogni modo in cui la
  // distanza dal bordo scrollabile può cambiare.
  useLayoutEffect(() => {
    if (!isSelected) return undefined;
    const wrapperEl = wrapperRef.current;
    const scrollAreaEl = wrapperEl?.closest<HTMLElement>('[data-canvas-scroll-area]') ?? null;
    if (!wrapperEl || !scrollAreaEl) return undefined;

    // 12px = l'offset negativo di `.overlay` (`BlockHoverOverlay.module.css`), più un
    // margine di sicurezza per il bordo/ombra della toolbar stessa: sotto questa soglia
    // l'overlay esterno finirebbe scrollato fuori dalla propria area (`overflow-y: auto`),
    // indistinguibile da un ritaglio sotto la Topbar.
    const ANTI_CLIP_THRESHOLD_PX = 20;

    function recomputeOverlayAnchor(): void {
      const distanceFromScrollTop =
        wrapperEl!.getBoundingClientRect().top - scrollAreaEl!.getBoundingClientRect().top;
      setOverlayAnchoredInside(distanceFromScrollTop < ANTI_CLIP_THRESHOLD_PX);
    }

    recomputeOverlayAnchor();
    scrollAreaEl.addEventListener('scroll', recomputeOverlayAnchor, { passive: true });
    window.addEventListener('resize', recomputeOverlayAnchor);
    return () => {
      scrollAreaEl.removeEventListener('scroll', recomputeOverlayAnchor);
      window.removeEventListener('resize', recomputeOverlayAnchor);
    };
  }, [isSelected]);

  /**
   * Drag & drop (dnd-kit, T7). Lo stato del trascinamento in corso non entra mai nello
   * store Zustand: `active`/`isOver` vivono nel `DndContext` di `EditorCanvas.tsx`, letti
   * qui solo per decidere cosa disegnare durante l'hover.
   */
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id,
    data: { type: node?.type },
    // Il trascinamento generale del nodo cede sempre il passo a un gesto più specifico già
    // in corso sullo stesso puntatore: editing di testo (punto 2 di T9), ridimensionamento
    // della maniglia di `container` (E03, punto 2) o della maniglia inter-colonna di
    // `section`.
    disabled: isEditingText || isResizingWidth || isResizingColumns,
  });
  const { setNodeRef: setDropBeforeRef, isOver: isOverBefore } = useDroppable({
    id: `before:${id}`,
    data: { parentId: location?.parentId ?? null, index: location?.index ?? 0 },
  });
  const { setNodeRef: setDropAfterRef, isOver: isOverAfter } = useDroppable({
    id: `after:${id}`,
    data: { parentId: location?.parentId ?? null, index: (location?.index ?? 0) + 1 },
  });
  const { setNodeRef: setDropInsideRef, isOver: isOverInside } = useDroppable({
    id: `inside:${id}`,
    data: { parentId: id, index: childIds.length },
  });
  const { active } = useDndContext();
  const activeDragId = active ? String(active.id) : null;
  const activeDragType = active
    ? (active.data.current as { type?: string } | undefined)?.type
    : undefined;

  /**
   * Ampiezza che questo nodo sta assumendo mentre la sua maniglia è sotto trascinamento
   * (E03, punto 3), `null` a riposo o se il gesto riguarda un altro container. Sottoscrive
   * solo il proprio id: il ridimensionamento di un fratello non ri-renderizza questo
   * wrapper. Chiamato qui, sopra la guardia di uscita, perché è un hook.
   */
  const resizePreviewPercent = useContainerResizePercent(id);

  /**
   * Stop di `columnRatio` che questa `section` sta assumendo mentre la sua maniglia
   * inter-colonna è sotto trascinamento, `null` a riposo o se il gesto riguarda un'altra
   * section. Stesso principio di {@link resizePreviewPercent} due righe sopra.
   */
  const columnResizePreviewRatio = useColumnResizeRatio(id);

  // Il nodo può sparire dall'albero fra un render e l'altro (eliminato da questa stessa
  // toolbar): non è un errore, semplicemente non c'è più nulla da renderizzare.
  if (!node || !location) return null;
  // Alias non-`undefined` per le funzioni dichiarate più sotto: la guardia sopra restringe
  // `node` solo nello scope sincrono di questo render, non dentro le closure delle funzioni
  // annidate (`handleCopyStyle` ecc.) — TypeScript non propaga il narrowing oltre un confine
  // di funzione.
  const currentNode = node;

  /**
   * Intercetta il click sul trigger (`<a href="#modal-{id}">`) o sul "Chiudi"
   * (`href="#"`) di un `modalTrigger` (ADR-59 § 2): mai lasciar navigare il browser verso
   * quel frammento, sostituito da {@link isModalTriggerOpen} + la regola CSS mirata
   * `[data-modal-open='true']` (`EditorBlockWrapper.module.css`) sullo stesso identico
   * pannello del componente puro (`ModalTriggerBlock.tsx`, invariato). `closest('a')`: il
   * bersaglio del click può essere un discendente testuale dell'ancora (es. il carattere
   * "×"), mai l'ancora stessa. No-op per ogni altro click su questo nodo — in particolare un
   * `heading`/`richText` annidato dentro il pannello (che deve restare selezionabile/
   * editabile come ogni altro figlio, punto E del task) non passa mai da qui: quel click
   * viene fermato prima dal proprio `EditorBlockWrapper` (`stopPropagation` sul suo stesso
   * `onClick`, invariato) e non risale fino a questo genitore.
   */
  function handleModalTriggerAnchorClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (currentNode.type !== 'modalTrigger') return;
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#modal-')) {
      event.preventDefault();
      setIsModalTriggerOpen(true);
    } else if (href === '#') {
      event.preventDefault();
      setIsModalTriggerOpen(false);
    }
  }

  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  const label = descriptor?.meta?.label ?? node.type;
  const ContainerComponent = CONTAINER_COMPONENTS[node.type];
  // `childrenAllow === '*'` (sentinel di ADR-39 § 4, `container`): esplicito, non più la
  // coincidenza `'*'.length === 1 > 0` — un contenitore con qualunque tipo ammesso è
  // comunque un contenitore, indipendentemente da come il registro esprime l'ammissione.
  const isContainer =
    descriptor?.childrenAllow === '*' || (descriptor?.childrenAllow.length ?? 0) > 0;
  /**
   * Icona del tipo di blocco per il badge nome mostrato su hover (`.hoverBadge`, restyle
   * Elementor Pro, punto 4 del task). `createElement`, non un tag JSX `<Icon />`
   * assegnato a una variabile locale: `blockIcon` restituisce sempre lo stesso
   * riferimento stabile di `ICON_MAP` (mai una funzione creata a questo render), ma per
   * l'analisi statica di React Compiler (`react-hooks/static-components`) un tag JSX con
   * nome dinamico è indistinguibile da un componente creato a ogni render — stesso
   * idioma già in uso in `WidgetPalette.tsx`.
   */
  const badgeIconElement = createElement(blockIcon(descriptor?.meta?.icon), {
    size: 12,
    'aria-hidden': true,
  });

  /**
   * Variante Elementor, solo su `section` (T-layout-colonne-section): bordo d'accento
   * magenta al posto del bordo blu generico di hover/selezione — il resto della chrome
   * (badge, toolbar, drop-zone) resta identico per ogni tipo di blocco, questa Section
   * ha in più solo la linguetta d'azione sostitutiva più sotto.
   */
  const isSection = node.type === 'section';

  /**
   * Nodo puntatore a una Sezione Globale (ADR-55, estende ADR-40): foglia (`children: []`),
   * mai un contenitore — governa solo il segnale visivo distintivo più sotto (bordo/badge
   * viola `#9333ea` "Sezione Globale" (RE-2), mai la disponibilità di "Converti in Sezione Globale",
   * che è l'opposto: offerta solo su un contenitore/`section` che *non* lo sia già, vedi
   * {@link isTopLevelContainerOrSection}).
   */
  const isGlobalRef = node.type === 'globalRef';

  /**
   * "Converti in Sezione Globale" (ADR-55): offerta solo su un contenitore o una `section`
   * di **primo livello** (`location.parentId === null`) — un `globalRef` non può contenere
   * altri blocchi da estrarre (cicli chiusi per contratto lato server, ADR-55), e un
   * contenitore/sezione annidato più in profondità resta fuori scope di questo round
   * (deviazione dichiarata, coerente con l'ADR: "Floating Toolbar/Inspector per
   * contenitori/sezioni di primo livello"). Il registro dei blocchi decide comunque
   * l'ammissibilità reale in scrittura: qui si decide solo se *offrire* l'azione, mai una
   * seconda validazione (stesso principio di ogni altra azione strutturale di questo file).
   */
  const isTopLevelContainerOrSection =
    // `node.type === 'container'` diretto e non `isContainerBlockType`: quella costante è
    // dichiarata più sotto in questo stesso corpo funzione (vicino a
    // `showContainerResizeHandle`, con cui condivide più contesto) — un riferimento
    // anticipato qui lancerebbe in fase di esecuzione (temporal dead zone di `const`).
    location.parentId === null && (isSection || node.type === 'container');

  /** Salva l'intero sottoalbero della Sezione corrente nel registro locale dei preset (F14-01). */
  function handleSavePreset(): void {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, currentNode);
    setPresetName('');
    setPresetModalOpened(false);
  }

  /**
   * Resizer inter-colonna (punto 1 del task): solo su `section` con esattamente due figli
   * e il valore effettivo di `columns` per il viewport attivo (`activeViewport`, Device
   * Switcher) che risolve a `'2'` — `columnRatio` non è responsive (`section.block.ts`),
   * "significativa solo con 2 colonne" (registro, `meta.help`). Mai su `Section.tsx`
   * (ADR-22 § 5, SSR pubblica condivide quel componente): la maniglia vive solo qui.
   */
  const showColumnResizer =
    isSection &&
    childIds.length === 2 &&
    resolveEffectiveResponsiveValue(currentNode.props.columns, activeViewport) === '2';
  /** Stop persistito sul nodo, `'equal'` di ripiego — stesso default del registro. */
  const persistedColumnRatio = resolveColumnRatio(currentNode.props.columnRatio);
  /**
   * Stop da disegnare: l'anteprima del trascinamento vince sul valore persistito finché il
   * gesto dura, poi torna a essere quella persistita — che nel frattempo il commit ha reso
   * uguale, quindi nessuno sfarfallio al rilascio. Stesso principio di
   * `effectiveWidthPercent` (E03) più sotto.
   */
  const effectiveColumnRatio = columnResizePreviewRatio ?? persistedColumnRatio;

  /**
   * Numero di colonne effettivo per il viewport attivo, per il segnaposto dello stato
   * vuoto sotto (bug collasso colonne): una `section` a più colonne senza figli renderizzava
   * un solo `.emptyContainer` come unico grid item di `.section` (ADR-31 § 7) — la griglia
   * CSS lo piazza nella prima traccia e le tracce successive restano vuote e invisibili,
   * indistinguibile da una sezione a colonna singola. Stesso fallback di `Section.tsx`/
   * `style-tokens.module.css`: nessun valore risolto → 1 colonna implicita.
   */
  const effectiveColumnsCount = (() => {
    const parsed = Number(
      resolveEffectiveResponsiveValue(currentNode.props.columns, activeViewport),
    );
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  })();

  /**
   * Avvia il drag: il contenitore di riferimento per il calcolo della frazione è il DOM
   * vero della `<section>` — non un ref dedicato (Section.tsx non forwarda ref):
   * `.childrenArea` (`display: contents`, sotto) è il genitore DOM diretto della maniglia,
   * e la `<section>` è il genitore di `.childrenArea`. L'anteprima parte dallo stop già
   * persistito, cosi il badge mostra subito la ripartizione corrente invece che un valore
   * vuoto.
   */
  function handleColumnResizerPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    selectNode(id);
    const handle = event.currentTarget;
    const containerEl = handle.parentElement?.parentElement;
    if (!containerEl) return;
    handle.setPointerCapture(event.pointerId);
    columnResizeRef.current = { containerEl, lastRatio: persistedColumnRatio };
    setIsResizingColumns(true);
    setColumnResizePreview(id, persistedColumnRatio);
  }

  /**
   * Trascinamento: solo anteprima visiva nello store, mai una voce di history (stesso
   * principio di E03, punto 3). Soglia minima 10% (task): già naturalmente rispettata, i
   * tre stop disponibili (50/50, 33/66, 66/33) sono tutti a distanza ≥10% dai bordi —
   * nessun clamp aggiuntivo necessario oltre al `Math.min`/`Math.max` che tiene la frazione
   * dentro [0,1].
   */
  function handleColumnResizerPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = columnResizeRef.current;
    if (!drag) return;
    const rect = drag.containerEl.getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextRatio = resolveColumnRatioFromFraction(fraction);
    if (nextRatio !== drag.lastRatio) {
      drag.lastRatio = nextRatio;
      setColumnResizePreview(id, nextRatio);
    }
  }

  /**
   * Rilascio: **un solo** punto di undo/redo per l'intero trascinamento
   * (`commitColumnRatioAction`), che azzera anche l'anteprima. Il valore committato viene
   * dal ref del gesto (`drag.lastRatio`), mai dallo stato reattivo dell'anteprima: stesso
   * principio di `widthResizeRef.lastPercent` (E03) — un valore chiuso per closure non
   * dipende dal timing del re-render fra un `pointermove` e il successivo `pointerup`.
   */
  function handleColumnResizerPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const drag = columnResizeRef.current;
    columnResizeRef.current = null;
    setIsResizingColumns(false);
    if (!drag) return;
    commitColumnRatioAction(id, drag.lastRatio);
  }

  /**
   * Gesto interrotto dal sistema (`pointercancel`): l'anteprima si butta via **senza**
   * committare — un trascinamento mai concluso non è una modifica che l'utente ha chiesto.
   */
  function handleColumnResizerPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    columnResizeRef.current = null;
    setIsResizingColumns(false);
    clearColumnResizePreview();
  }

  /**
   * Visibilità per breakpoint (ADR-37 § 3) nel Canvas: il nodo è "nascosto sul
   * dispositivo attivo" quando la prop scalare corrispondente al `Device Switcher`
   * corrente (`activeViewport`) è `true` — mai in base al reale `display:none` delle
   * media query di `style-tokens.module.css` (queste rispondono alla larghezza vera
   * della finestra del browser dell'admin, non al viewport simulato). Il blocco deve
   * restare selezionabile e modificabile anche mentre è nascosto per quel dispositivo:
   * `tokenStyles.previewHidden`, applicata sotto, sostituisce il `display:none` reale
   * ereditato dal componente di contenuto con la sola attenuazione visiva.
   */
  const isHiddenForActiveViewport = currentNode.props[VIEWPORT_HIDE_PROP[activeViewport]] === true;

  /**
   * `colSpan` (ADR-51, `form-field`/`form-submit`): dentro `.fields` di
   * `FormBlock.module.css` (griglia a 12 colonne) il grid item reale nel Canvas è
   * **questo** `.wrapper`, non la radice di `FormFieldBlock.tsx` (`grid-column` da
   * `colSpan`) né quella di `FormSubmitBlock.tsx` (`grid-column: 1 / -1` fisso) — un
   * livello più a fondo per via della chrome dell'editor, quindi il `grid-column` che quei
   * componenti calcolano sulla propria radice non ha alcun effetto sul posizionamento nella
   * griglia del genitore, e il nodo resta relegato a un'unica traccia stretta invece di
   * estendersi alla larghezza prevista. Sul sito pubblico (`BlockRenderer.tsx`, nessun
   * wrapper interposto) quel div è già il grid item diretto, dove la classe fa già effetto:
   * stessa risoluzione (stesso fallback a `span 12` per `form-field`, `span 12` — equivalente
   * a `1 / -1` su una griglia di 12 colonne — per `form-submit`, che non dichiara `colSpan`),
   * applicata qui in più perché qui serve a un elemento diverso, non in sostituzione.
   */
  const formFieldColSpanClassName =
    currentNode.type === 'form-field'
      ? resolveResponsiveClassNames(tokenStyles, 'colSpan', currentNode.props.colSpan) ||
        tokenStyles.colSpan_default_12
      : currentNode.type === 'form-submit'
        ? tokenStyles.colSpan_default_12
        : '';

  /**
   * Solo `container` (ADR-39) ha una prop di larghezza dichiarata dal registro
   * ({@link CONTAINER_WIDTH_SPEC}): questo booleano resta ristretto al tipo esatto, a
   * differenza di `isContainer` sopra (che include anche `section` e ogni futuro tipo
   * contenitore) — governa **solo** {@link showContainerResizeHandle} più sotto, mai la
   * colorazione hover/selezione (vedi `className`/Handle Bar, che usano `isContainer`).
   */
  const isContainerBlockType = node.type === 'container';

  /**
   * Maniglia di ridimensionamento orizzontale (E03, punto 1): solo su un `container`
   * **selezionato** — mai su hover, mai su `section` (che ha già il proprio resizer
   * inter-colonna più sotto), mai se il registro non dichiara la prop di larghezza
   * ({@link CONTAINER_WIDTH_SPEC}).
   */
  const showContainerResizeHandle =
    isContainerBlockType && isSelected && CONTAINER_WIDTH_SPEC !== null;

  /** Percentuale già persistita sul nodo, `null` se la prop è assente o di altra forma. */
  const persistedWidthPercent = readContainerWidthPercent(currentNode.props[CONTAINER_WIDTH_PROP]);

  /**
   * Ampiezza da disegnare: l'anteprima del trascinamento vince sul valore persistito
   * finché il gesto dura, poi torna a essere quella persistita — che nel frattempo il
   * commit ha reso uguale, quindi nessuno sfarfallio al rilascio.
   */
  const effectiveWidthPercent = resizePreviewPercent ?? persistedWidthPercent;

  /**
   * Larghezza applicata al wrapper del nodo. Inline e non una classe: è una percentuale
   * continua, non esprimibile come classe statica (stesso idioma del `left` della maniglia
   * inter-colonna). `flexGrow: 0`/`flexShrink: 0` sono necessari quanto la larghezza: dentro
   * un `container` flex il valore di default `flex-shrink: 1` rimpicciolirebbe comunque il
   * nodo appena la riga si riempie, e la larghezza appena scelta non sarebbe quella resa.
   */
  const widthStyle =
    effectiveWidthPercent === null
      ? undefined
      : { width: `${effectiveWidthPercent}%`, flexGrow: 0, flexShrink: 0 };

  /**
   * Maniglie generiche di resize (ADR-71, SPEC-F04-super-elementor.md § 4.2/4.3): risolte
   * per il tipo di **questo** nodo tramite il registro (`resolveResizePropSpec`, mai un
   * numero duplicato a mano qui — stesso principio di {@link CONTAINER_WIDTH_SPEC}), e
   * montate solo su un blocco **selezionato** — stesso gate di
   * {@link showContainerResizeHandle}. `null` per un tipo/prop non dichiarata dal registro
   * spegne la maniglia corrispondente: nessun elemento renderizzato, nessun commit
   * possibile (stesso principio di `CONTAINER_WIDTH_SPEC !== null`).
   *
   * `boxedWidth`/`minHeight`: prop di `container` `v: 2` (`ADR-82-container-unificato-grid-
   * flex.md` § "Decisione" punto 1, sostituiscono le `styleWidth`/`styleHeight` di `container`
   * `v: 1` viste da ADR-71 § "Decisione" punto 3) — coesistono col resizer esistente di
   * `container.styleFlexBasis`, mai al suo posto (SPEC-F04-super-elementor.md § 4.2, "accanto,
   * non al posto"). `image` dichiara ancora `styleWidth`/`styleHeight` (prop proprie, invariate
   * da `ADR-82`) ma resta comunque esclusa da questa maniglia in quanto widget foglia (ADR-73).
   * `styleMargin{Top,Bottom,Left,Right}`: dichiarate sui tipi che già hanno
   * `styleSpaceBefore/After` (`button`/`heading`/`richText`/`image`).
   */
  const widthResizeSpec = isSelected ? resolveResizePropSpec(currentNode.type, 'boxedWidth') : null;
  const heightResizeSpec = isSelected ? resolveResizePropSpec(currentNode.type, 'minHeight') : null;
  const marginTopResizeSpec = isSelected
    ? resolveResizePropSpec(currentNode.type, 'styleMarginTop')
    : null;
  const marginBottomResizeSpec = isSelected
    ? resolveResizePropSpec(currentNode.type, 'styleMarginBottom')
    : null;
  const marginLeftResizeSpec = isSelected
    ? resolveResizePropSpec(currentNode.type, 'styleMarginLeft')
    : null;
  const marginRightResizeSpec = isSelected
    ? resolveResizePropSpec(currentNode.type, 'styleMarginRight')
    : null;

  /**
   * Avvio del gesto: si misurano **una volta sola** il bordo sinistro del nodo e la
   * larghezza del contenitore padre, e si cattura il puntatore sulla maniglia — da qui in
   * poi ogni `pointermove`/`pointerup` arriva alla maniglia anche se il puntatore esce dal
   * suo box di 10px, che a un trascinamento veloce succede sempre.
   *
   * Il padre di riferimento non è il genitore DOM diretto del wrapper (`.childrenArea` è
   * `display: contents`, un elemento senza box): {@link resolveLayoutParentWidth} risale
   * fino al primo antenato con una larghezza reale.
   */
  function handleWidthResizePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (!CONTAINER_WIDTH_SPEC) return;
    const wrapperEl = wrapperRef.current;
    const parentWidth = resolveLayoutParentWidth(wrapperEl);
    if (!wrapperEl || parentWidth === null) return;

    const originLeft = wrapperEl.getBoundingClientRect().left;
    // Punto di partenza del badge: la larghezza che il nodo ha davvero adesso, non il solo
    // valore persistito — un container senza prop di larghezza mostra comunque subito la
    // propria ampiezza corrente invece di un badge vuoto.
    const startPercent =
      containerWidthPercentFromPointer(
        originLeft + wrapperEl.getBoundingClientRect().width,
        originLeft,
        parentWidth,
        CONTAINER_WIDTH_SPEC,
      ) ?? CONTAINER_WIDTH_SPEC.max;

    event.currentTarget.setPointerCapture(event.pointerId);
    widthResizeRef.current = { originLeft, parentWidth, lastPercent: startPercent };
    setIsResizingWidth(true);
    setContainerResizePreview(id, startPercent);
  }

  /** Trascinamento: solo anteprima visiva, mai una voce di history (E03, punto 3). */
  function handleWidthResizePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = widthResizeRef.current;
    if (!drag || !CONTAINER_WIDTH_SPEC) return;
    const percent = containerWidthPercentFromPointer(
      event.clientX,
      drag.originLeft,
      drag.parentWidth,
      CONTAINER_WIDTH_SPEC,
    );
    if (percent === null) return;
    drag.lastPercent = percent;
    setContainerResizePreview(id, percent);
  }

  /**
   * Rilascio: **un solo** punto di undo/redo per l'intero trascinamento
   * (`commitContainerWidthAction`), che azzera anche l'anteprima.
   */
  function handleWidthResizePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const drag = widthResizeRef.current;
    widthResizeRef.current = null;
    setIsResizingWidth(false);
    if (!drag) return;
    commitContainerWidthAction(id, drag.lastPercent);
  }

  /**
   * Gesto interrotto dal sistema (`pointercancel`: puntatore perso, gesto rubato dal
   * browser): l'anteprima si butta via **senza** committare — un trascinamento che non è
   * mai stato concluso non è una modifica che l'utente ha chiesto.
   */
  function handleWidthResizePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    widthResizeRef.current = null;
    setIsResizingWidth(false);
    clearContainerResizePreview();
  }

  /**
   * Colore di livello di annidamento (RE-2, restyle chrome Elementor Pro): resta un solo
   * calcolo qui, esposto come custom property `--block-level-color` sullo `style` del
   * wrapper più sotto (le property CSS ereditano lungo il DOM, nessun prop-drilling del
   * colore) — dopo T-editor-refinement (vedi {@link overlayBorderClassName} sotto) il suo
   * unico consumatore reale è il bordo di hover/selezione dei **widget foglia**: la
   * maniglia contestuale (`BlockHoverOverlay.tsx`, `.overlay`) non legge più questa
   * property (sfondo azzurro unitario, non colorato per livello — requisito esplicito
   * pixel-perfect del task) e il bordo di Sezioni/Container usa ora il magenta Elementor
   * fisso `#e0007b` invece del livello calcolato qui (vedi sotto). La costante resta
   * comunque tre valori distinti — e i test RE-2 pre-esistenti continuano ad asserirla
   * così — perché resta il segnale usato per i soli widget foglia e per popolare
   * `--block-level-color` con un valore coerente indipendentemente da chi lo consuma.
   * - Viola/Magenta: Sezioni di **primo livello** (`isTopLevelSection`) e Sezioni Globali
   *   (`isGlobalRef`, ADR-55) — il confine strutturale più esterno della pagina.
   * - Azzurro: `section` annidata (non di primo livello) e `container` (ADR-39,
   *   "container figli e colonne") — qualunque profondità.
   * - Blu: tutto il resto — i widget foglia, più `form`/`navMenu` (ADR-46/ADR-52, nessuna
   *   categoria propria richiesta dal task: restano nel gruppo "widget", stessa
   *   classificazione già in uso prima di questo restyle per quei due tipi).
   */
  // Magenta Elementor (T-editor-refinement, richiesta esplicita pixel-perfect del task):
  // sostituisce il viola `#9333ea` di RE-2 — stessa custom property, stesso unico calcolo,
  // nessuna nuova sorgente di colore introdotta.
  const LEVEL_COLOR_TOP_SECTION = '#e0007b';
  const LEVEL_COLOR_NESTED_CONTAINER = '#0284c7';
  const LEVEL_COLOR_LEAF_WIDGET = '#2563eb';
  const isTopLevelSection = isSection && location.parentId === null;
  const isContainerOrSection = isSection || isContainerBlockType;
  const blockLevelColor =
    isGlobalRef || isTopLevelSection
      ? LEVEL_COLOR_TOP_SECTION
      : isContainerOrSection
        ? LEVEL_COLOR_NESTED_CONTAINER
        : LEVEL_COLOR_LEAF_WIDGET;

  /**
   * Bordo di hover/selezione (T-editor-refinement, pixel-perfect Elementor Pro — requisito
   * esplicito del task, supera il precedente schema "colore di livello" di RE-2 *solo* per
   * Sezioni/Container).
   * - `globalRef` (ADR-55): bordo pieno **sempre** visibile (`.globalRefBorder`), non solo
   *   su hover/selezione — segnala l'impatto trasversale del nodo (modificarlo altrove
   *   aggiorna ogni Pagina che lo referenzia) indipendentemente da un'interazione in
   *   corso, stesso principio informativo di `.hiddenBadge` più sotto. Invariato da questo
   *   restyle: resta `#9333ea` (`.globalRefBorder`), non gated da hover/selezione, quindi
   *   fuori dal perimetro letterale del task ("in hover o selezionato").
   * - Sezione/Container (`isContainerOrSection`, qualunque profondità — RE-2 distingueva
   *   primo livello/annidato con due colori diversi, viola/azzurro: il task chiede ora un
   *   solo bordo magenta fisso `#e0007b` **sia** in hover **sia** in selezione, non più
   *   derivato da {@link blockLevelColor}) — bordo pieno 1px `#e0007b`
   *   (`.selectedSectionChrome`/`.hoveredSectionChrome`, `EditorBlockWrapper.module.css`):
   *   la selezione aggiunge solo l'ombreggiatura di enfasi, non uno stile di bordo diverso
   *   (a differenza del tratteggiato precedente sull'hover — il task è esplicito: "il
   *   bordo deve essere 1px solid #e0007b" per entrambi gli stati, non un caso dashed).
   * - Widget foglia (mai Sezioni/Container): logica invariata da RE-2, non toccata da
   *   questo restyle — bordo solo su selezione (`.selectedChrome`, colore da
   *   {@link blockLevelColor}, qui sempre blu `#2563eb`), nessun bordo sul solo hover.
   *
   * Contraddizione nota con lo schema "colore per livello di annidamento" di RE-2 (vedi
   * doc di {@link blockLevelColor} sopra): quello schema restava tre colori distinti per
   * primo-livello/annidato/foglia usati sia dal bordo sia dalla maniglia; il task attuale
   * lo richiede esplicitamente solo per Sezioni/Container (fisso, non più a due livelli) e
   * lo lascia invariato per i soli widget foglia — vedi il report dell'agente per il
   * dettaglio della scelta.
   */
  const isHoveredEffective = isHovered || isHoveredFromNavigator;
  const overlayBorderClassName = isGlobalRef
    ? styles.globalRefBorder
    : isSelected
      ? isContainerOrSection
        ? styles.selectedSectionChrome
        : styles.selectedChrome
      : isHoveredEffective && isContainerOrSection
        ? styles.hoveredSectionChrome
        : '';

  const className = [
    styles.wrapper,
    overlayBorderClassName,
    formFieldColSpanClassName,
    isInvalid ? styles.invalid : '',
    isDragging ? styles.dragging : '',
    resolveHideClassName(tokenStyles, 'hideDesktop', currentNode.props.styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', currentNode.props.styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', currentNode.props.styleHideMobile),
    isHiddenForActiveViewport ? tokenStyles.previewHidden : '',
    // "Occhio" del navigator (stato UI, mai persistito): a differenza di
    // `previewHidden` sopra, che solo attenua mantenendo il nodo selezionabile,
    // qui l'intento dichiarato dall'utente è "nascondi" — `display: none` reale.
    isHiddenInCanvas ? styles.hiddenInCanvas : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        ref={(element) => {
          setDragRef(element);
          wrapperRef.current = element;
        }}
        className={className}
        // Larghezza del container ridimensionato (E03: anteprima durante il gesto, valore
        // persistito a riposo, assente per ogni altro blocco) più `--block-level-color`
        // (RE-2), sempre presente: la custom property che `BlockHoverOverlay`/`.overlay`
        // e i bordi `.hoveredChrome`/`.selectedChrome` (EditorBlockWrapper.module.css)
        // leggono per il colore di livello — un solo `style` inline per entrambi gli scopi,
        // mai due assegnazioni separate sullo stesso nodo. Il cast è necessario perché
        // `CSSProperties` di React non tipizza le custom property native, non un `any`.
        style={
          {
            ...widthStyle,
            '--block-level-color': blockLevelColor,
          } as CSSProperties
        }
        data-block-type={node.type}
        // Bersaglio dello scroll-sync del pannello Struttura/Navigator
        // (`EditorStructureNavigator.tsx`): `querySelector('[data-block-id="…"]')` dal
        // navigator porta il blocco selezionato in vista nel canvas.
        data-block-id={node.id}
        // Apertura visiva del pannello `modalTrigger` nel Canvas (ADR-59 § 2): presente solo
        // per questo tipo di nodo e solo mentre aperto — la regola CSS mirata
        // (`EditorBlockWrapper.module.css`) forza `display:flex` sul pannello del componente
        // puro senza mai toccare `location.hash` (vedi {@link isModalTriggerOpen} sopra).
        data-modal-open={
          currentNode.type === 'modalTrigger' && isModalTriggerOpen ? 'true' : undefined
        }
        // Bersaglio di selezione da tastiera (T-canvas-cleanup): rimpiazza l'`UnstyledButton`
        // testuale rimosso dalla toolbar, che era l'unico modo di selezionare senza mouse.
        // `aria-label` porta il tipo di blocco che prima si leggeva nel badge/etichetta
        // testuale, ora solo iconici. `event.target !== currentTarget` esclude i tasti
        // premuti dentro un discendente focusabile (link del blocco Button, testo in
        // editing) dal riselezionare questo nodo — solo Invio/Spazio sul bordo del wrapper
        // stesso attivano la selezione.
        tabIndex={0}
        aria-label={label}
        onClick={(event) => {
          // Il click seleziona il nodo più interno: senza stop, la selezione risalirebbe
          // fino alla sezione che lo contiene.
          event.stopPropagation();
          // No-op per ogni tipo diverso da `modalTrigger` (vedi la guardia interna).
          handleModalTriggerAnchorClick(event);
          selectNode(id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            selectNode(id);
          }
        }}
        onFocus={(event) => {
          // Solo un discendente in editing (mai il wrapper stesso, raggiunto da tab — vedi
          // `onKeyDown` sopra): disabilita il drag di questo nodo finché dura (punto 2 del
          // task, `useDraggable({ disabled: isEditingText })` più sopra).
          if (
            event.target !== event.currentTarget &&
            (event.target as HTMLElement).isContentEditable
          ) {
            setIsEditingText(true);
          }
        }}
        onBlur={(event) => {
          if ((event.target as HTMLElement).isContentEditable) {
            setIsEditingText(false);
          }
        }}
        onMouseOver={(event) => {
          // Stesso principio del click qui sopra: `stopPropagation` impedisce all'evento
          // (nativo, con bubbling) di risalire al wrapper del contenitore che lo ospita,
          // che altrimenti si marcherebbe "hovered" insieme a questo nodo.
          event.stopPropagation();
          setIsHovered(true);
        }}
        onMouseOut={(event) => {
          event.stopPropagation();
          setIsHovered(false);
        }}
        onMouseEnter={(event) => event.stopPropagation()}
        onMouseLeave={(event) => event.stopPropagation()}
      >
        {/*
          Zona di rilascio "prima di questo nodo": riordino/spostamento fra fratelli.
          Annidata qui dentro (non più fratello del wrapper, T-layout-colonne-section):
          vedi il commento di testa di `.dropZone` in EditorBlockWrapper.module.css.
        */}
        <div
          ref={setDropBeforeRef}
          className={`${styles.dropZone} ${styles.dropZoneBefore}`}
          {...dropZoneAttrs(isOverBefore, activeDragId, activeDragType, location.parentId)}
        />

        {/*
          Maniglia di ridimensionamento orizzontale del `container` (E03, punto 1). Vive
          qui dentro — non accanto ai figli come il resizer inter-colonna di `section` — 
          perché ridimensiona **questo** nodo rispetto al proprio contenitore padre, non
          il confine fra due figli: il riferimento è il bordo destro del wrapper, e
          `.wrapper` è già `position: relative` (EditorBlockWrapper.module.css).
        */}
        {showContainerResizeHandle && (
          <ContainerResizeHandle
            percent={effectiveWidthPercent}
            isResizing={isResizingWidth}
            ariaLabel={
              effectiveWidthPercent === null
                ? 'Ridimensiona la larghezza del Contenitore'
                : `Ridimensiona la larghezza del Contenitore (attuale: ${formatContainerWidthBadge(effectiveWidthPercent)})`
            }
            onPointerDown={handleWidthResizePointerDown}
            onPointerMove={handleWidthResizePointerMove}
            onPointerUp={handleWidthResizePointerUp}
            onPointerCancel={handleWidthResizePointerCancel}
          />
        )}

        {/*
          Maniglie generiche di resize (ADR-71, SPEC-F04-super-elementor.md § 4.2/4.3):
          `boxedWidth`/`minHeight` (ADR-82 § "Decisione" punto 1) accanto alla maniglia
          esistente sopra (mai al suo posto), più i quattro margini per lato sui tipi che li
          dichiarano. Ognuna possiede il proprio gesto (`ResizeHandle.tsx`), a differenza della
          maniglia sopra — qui non servono handler locali. `units` è quello già risolto da
          `resolveResizePropSpec` (mai un letterale duplicato qui: `minHeight` dichiara
          `px`/`vh` nel registro, di cui questa maniglia pilota solo `px`).
        */}
        {widthResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="boxedWidth"
            axis="horizontal"
            min={widthResizeSpec.min}
            max={widthResizeSpec.max}
            units={widthResizeSpec.units}
          />
        )}
        {heightResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="minHeight"
            axis="vertical"
            min={heightResizeSpec.min}
            max={heightResizeSpec.max}
            units={heightResizeSpec.units}
          />
        )}
        {marginTopResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="styleMarginTop"
            axis="vertical"
            min={marginTopResizeSpec.min}
            max={marginTopResizeSpec.max}
            units={['px', '%']}
          />
        )}
        {marginBottomResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="styleMarginBottom"
            axis="vertical"
            min={marginBottomResizeSpec.min}
            max={marginBottomResizeSpec.max}
            units={['px', '%']}
          />
        )}
        {marginLeftResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="styleMarginLeft"
            axis="horizontal"
            min={marginLeftResizeSpec.min}
            max={marginLeftResizeSpec.max}
            units={['px', '%']}
          />
        )}
        {marginRightResizeSpec && (
          <ResizeHandle
            blockId={id}
            propName="styleMarginRight"
            axis="horizontal"
            min={marginRightResizeSpec.min}
            max={marginRightResizeSpec.max}
            units={['px', '%']}
          />
        )}

        {/*
          Toolbar di selezione: montata per qualunque tipo di blocco (Sezioni, Colonne,
          widget foglia) solo quando `isSelected` (mai sul solo hover — quello mostra
          invece il badge nome subito sotto, mai i due insieme sullo stesso blocco,
          richiesta esplicita di un round successivo del task) — reversal esplicito e
          autorizzato dal proprietario del progetto delle tre varianti mutuamente esclusive
          per categoria che vivevano qui prima (Handle Tab di Sezione, badge informativo di
          Colonna, linguetta "Modifica" di foglia): sette controlli base sempre nello stesso
          posto (`BlockHoverOverlay.tsx`) — aggiungi sopra e aggiungi sotto (`BlockPalette`,
          stesso menu puntato su `location.parentId` con indice prima/dopo il nodo), trascina
          (`attributes`/`listeners` dnd-kit di sempre), seleziona genitore
          (`selectNode(location.parentId)`, disabilitato su un nodo di radice), duplica
          (`duplicateNodeAction`), elimina (apre lo stesso `ConfirmModal` già montato più
          sotto, mai un secondo modal), modifica (`selectNode`, già imposta
          `activeSidebarTab: 'properties'`). "Sposta su/giù" e
          "Sposta dentro/fuori dal contenitore" restano raggiungibili solo dal menu
          contestuale (tasto destro, `CanvasContextMenu.tsx`) — mai una seconda copia della
          stessa azione qui. Gli `aria-label` dei quattro
          pulsanti preesistenti riprendono il formato già cercato dagli helper Playwright
          pre-esistenti in
          `e2e/tests/helpers/page-editor.ts` prima della rimozione della vecchia toolbar
          unica.
        */}
        {isSelected && (
          <BlockHoverOverlay
            id={id}
            label={label}
            parentId={location.parentId}
            // Primo controllo "+" (RE-2): inserisce un blocco fratello **prima** di
            // questo nodo, quindi stesso `location.parentId` di sopra ma indice/tipo del
            // genitore dedicati — non il contenuto di questo nodo (quello userebbe `id`
            // come parent, non `location.parentId`).
            addBeforeIndex={location.index}
            addBeforeParentType={location.parentType}
            // Ultimo controllo base "+" (speculare al primo): inserisce un blocco fratello
            // **dopo** questo nodo, stesso `location.parentId` di sopra ma indice del
            // fratello successivo (`location.index + 1`) invece dell'indice del nodo
            // corrente.
            addAfterIndex={location.index + 1}
            addAfterParentType={location.parentType}
            attributes={attributes}
            listeners={listeners}
            anchorInside={overlayAnchoredInside}
            onDelete={() => setConfirmOpened(true)}
            // Sesto controllo (F14-01), solo su `section`: nessun'altra categoria di
            // blocco offre oggi "Salva come Preset Globale" dalla toolbar di selezione —
            // `AdvancedTab.tsx` resta l'unico altro punto d'ingresso, lì esteso anche a
            // `container`.
            onSaveAsPreset={isSection ? () => setPresetModalOpened(true) : undefined}
            // Settimo controllo (ADR-55, estende ADR-40): solo su un contenitore/`section`
            // di primo livello — vedi {@link isTopLevelContainerOrSection}. Apre lo stesso
            // `ConvertToGlobalSectionModal.tsx` montato anche da `AdvancedTab.tsx`
            // (Property Inspector), mai una seconda implementazione del modal.
            onConvertToGlobalSection={
              isTopLevelContainerOrSection ? () => setConvertModalOpened(true) : undefined
            }
            // Ottavo controllo (ADR-56 § 2/§ 3): esporta il sottoalbero di questo nodo come
            // file JSON — offerto solo su un contenitore (`isContainer`, già calcolato sopra
            // per la stessa domanda di ammissibilità strutturale di questo file), mai una
            // seconda regola duplicata in `BlockHoverOverlay.tsx`.
            onExportJson={isContainer ? () => exportSubtreeToJson(currentNode) : undefined}
            // Tooltip della maniglia drag (T-editor-refinement, richiesta esplicita del
            // task, fedele a Elementor): solo su `section`, "Modifica Contenitore" invece
            // del generico "Trascina per riordinare" — `undefined` su ogni altro tipo di
            // blocco, che tiene l'etichetta di default (`BlockHoverOverlay.tsx`).
            dragTooltipLabel={isSection ? 'Modifica Contenitore' : undefined}
            tone={isContainerOrSection ? 'section' : 'component'}
          />
        )}

        {/*
          Badge nome del blocco (qualunque tipo, non più solo Colonne): icona + nome del
          tipo nell'angolo superiore sinistro interno, nessun pulsante — mostrato solo su
          hover **senza** selezione (`isHovered && !isSelected`), lasciando il posto alla
          toolbar di selezione sopra appena il nodo viene selezionato. `pointer-events:
          none`: puramente informativo, il click-to-select del wrapper (`onClick` sul `div`
          principale) resta l'unico modo di selezionare questo nodo, invariato. Mai su un
          `globalRef` (`!isGlobalRef`): quel tipo mostra invece il proprio badge dedicato
          poco sotto, sempre visibile e non solo su hover — due badge nello stesso angolo si
          sovrapporrebbero.
        */}
        {isHovered && !isSelected && !isGlobalRef && (
          <span className={styles.hoverBadge} aria-hidden="true">
            {badgeIconElement}
            <Text size="xs" fw={500} className={styles.hoverBadgeLabel}>
              {label}
            </Text>
          </span>
        )}

        {/*
          Maniglia di selezione del Contenitore (RE-3, parità Elementor Pro): un piccolo
          quadrato grigio piatto, angolo superiore sinistro — elemento separato da
          `.hoverBadge` sopra (mai riusato: quel badge resta generico icona+nome per
          qualunque tipo). Montata solo su `container` (`isContainerBlockType`), mentre il
          nodo è in hover o già selezionato — un contenitore selezionato non mostra più
          `.hoverBadge` (`!isSelected` sopra), ma resta comunque utile poter riselezionare
          lo stesso nodo da qui (es. dopo aver selezionato un figlio). Click: nessuna nuova
          azione nello store — stesso `selectNode` già usato per "Seleziona genitore" e per
          il click-to-select del wrapper stesso.
        */}
        {isContainerBlockType && (isHovered || isSelected) && (
          <button
            type="button"
            className={styles.containerSelectHandle}
            aria-label="Seleziona Contenitore"
            title="Seleziona Contenitore"
            onClick={(event) => {
              event.stopPropagation();
              selectNode(id);
            }}
          />
        )}

        {/*
          Badge "Sezione Globale" (ADR-55, estende ADR-40): sempre visibile su un nodo
          `globalRef`, non solo su hover/selezione — stesso principio informativo di
          `.hiddenBadge` sotto, qui per segnalare che il contenuto vero vive altrove
          (modulo Sezioni Globali) e che modificarlo da lì ha impatto su ogni Pagina che
          referenzia la stessa riga. `aria-hidden`: puramente informativo, nessuna azione
          (la sola azione disponibile su questo nodo resta "Elimina il riferimento", già
          coperta dalla toolbar di selezione comune).
        */}
        {isGlobalRef && (
          <span className={styles.globalRefBadge} aria-hidden="true">
            <IconWorld size={12} />
            Sezione Globale
          </span>
        )}

        {/*
          Badge "Nascosto su [Device]" (ADR-37 § 3): sempre visibile quando il nodo è
          nascosto sul dispositivo attivo del Device Switcher — non solo su hover/
          selezione come la Handle Bar sopra, altrimenti l'attenuazione applicata dal
          contenuto (`tokenStyles.previewHidden`) resterebbe senza spiegazione appena il
          puntatore si allontana. `aria-hidden`: puramente informativo, nessuna azione.
        */}
        {isHiddenForActiveViewport && (
          <span className={styles.hiddenBadge} aria-hidden="true">
            Nascosto su {VIEWPORT_LABEL[activeViewport]}
          </span>
        )}

        {isContainer && ContainerComponent ? (
          <BlockErrorBoundary>
            <ContainerComponent
              {...resolveContainerComponentProps(currentNode, location, parentCompositeProps)}
              // Anteprima in tempo reale della ripartizione delle colonne (60fps, task): la
              // Section riceve lo stop effettivo (anteprima durante il trascinamento,
              // altrimenti quello persistito) invece del solo valore già salvato — le due
              // classi CSS statiche di `columnRatio_*` (`style-tokens`) cambiano subito
              // senza attendere il commit al rilascio. Solo quando la maniglia è offerta:
              // per ogni altro nodo il valore raw di `resolveContainerComponentProps` resta
              // l'unico, senza alcuna sovrascrittura.
              {...(showColumnResizer ? { columnRatio: effectiveColumnRatio } : {})}
            >
              {/*
                Evidenziazione "dentro questo contenitore" (dnd-kit T7): overlay a sé
                (`position: absolute; inset: 0`, EditorBlockWrapper.module.css), non più
                un box che avvolge i figli — un contenitore a griglia (ADR-31) deve
                mostrare i propri figli come veri grid item del genitore, non annidati
                dentro un unico wrapper che collasserebbe la griglia a una sola colonna
                (il bug che questo file corregge). Magenta su `section` (T-layout-colonne-
                section), blu generico su ogni altro contenitore futuro.
              */}
              <div
                ref={setDropInsideRef}
                className={[
                  styles.containerDropZone,
                  isSection ? styles.containerDropZoneSection : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...dropZoneAttrs(isOverInside, activeDragId, activeDragType, id)}
              />

              {isSection &&
                effectiveColumnsCount > 1 &&
                Array.from({ length: effectiveColumnsCount }).map((_, columnIndex) => (
                  <ColumnDropTarget
                    key={`column-drop-${columnIndex}`}
                    parentId={id}
                    columnIndex={columnIndex}
                    columnCount={effectiveColumnsCount}
                    activeDragId={activeDragId}
                    activeDragType={activeDragType}
                  />
                ))}

              {childIds.length === 0 ? (
                effectiveColumnsCount > 1 ? (
                  // Un segnaposto per traccia della griglia (`.childrenArea`, `display:
                  // contents`, stessa tecnica del ramo "figli presenti" sotto): ogni box
                  // diventa un vero grid item di `.section`, tutte le colonne configurate
                  // restano visibili e affiancate anche a zero figli.
                  <div className={styles.childrenArea}>
                    {Array.from({ length: effectiveColumnsCount }).map((_, slotIndex) => (
                      <div
                        key={slotIndex}
                        className={styles.emptyContainer}
                        // Seleziona questo contenitore come target prima di aprire il menu
                        // di inserimento (F08 STEP 3): stesso `stopPropagation` del click-
                        // to-select del wrapper più sopra, mai la selezione risale a un
                        // antenato.
                        onClick={(event) => {
                          event.stopPropagation();
                          selectNode(id);
                        }}
                      >
                        <BlockPalette
                          parentId={id}
                          parentType={node.type}
                          label="Aggiungi blocco"
                          size="sm"
                          variant="default"
                          iconOnly
                          triggerClassName={styles.emptyContainerTrigger}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={styles.emptyContainer}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectNode(id);
                    }}
                  >
                    <BlockPalette
                      parentId={id}
                      parentType={node.type}
                      label="Aggiungi blocco"
                      size="sm"
                      variant="default"
                      iconOnly
                      triggerClassName={styles.emptyContainerTrigger}
                    />
                  </div>
                )
              ) : (
                // `display: contents` (EditorBlockWrapper.module.css): questo `div` non
                // genera un box proprio, i wrapper dei blocchi figli diventano grid item
                // diretti di `ContainerComponent` (`.section`) invece di finire tutti
                // dentro l'unica cella di questo `div` — la correzione del bug: prima la
                // griglia CSS del genitore vedeva un solo grid item (questo wrapper), ora
                // uno per figlio, come sul sito pubblico (`BlockRenderer.tsx`).
                <div className={styles.childrenArea}>
                  {childIds.map((childId) => (
                    <EditorBlockWrapper key={childId} id={childId} />
                  ))}
                  {/*
                    Maniglia di resize inter-colonna: `position: absolute`
                    (ColumnResizer.module.css) la esclude dal posizionamento automatico
                    della griglia CSS (stesso principio di `.containerDropZone`/`.dropZone`
                    sopra), quindi non conta come terzo grid item.
                  */}
                  {showColumnResizer && (
                    <ColumnResizer
                      ratio={effectiveColumnRatio}
                      isResizing={isResizingColumns}
                      ariaLabel={`Ridimensiona le colonne della Section (attuale: ${effectiveColumnRatio})`}
                      onPointerDown={handleColumnResizerPointerDown}
                      onPointerMove={handleColumnResizerPointerMove}
                      onPointerUp={handleColumnResizerPointerUp}
                      onPointerCancel={handleColumnResizerPointerCancel}
                    />
                  )}
                </div>
              )}
            </ContainerComponent>
          </BlockErrorBoundary>
        ) : (
          <BlockRenderer
            node={node}
            // Segnaposto "titolo/testo vuoto" (BlockRenderer.tsx § isEditorCanvas): sempre
            // vero per ogni foglia montata da questo wrapper, selezionata o meno — mai dal
            // sito pubblico, che non passa questa prop.
            isEditorCanvas
            // Editing in-place (T9): solo sul nodo selezionato, mai su hover — coerente con
            // "editing del testo direttamente nel canvas quando il blocco è selezionato".
            // `onTextChange`/`onHtmlChange`/`onLabelChange` (commit su `blur`) passano sempre
            // da `updateBlockPropsAction` (mai una mutazione diretta): resta un comando
            // invertibile sull'undo stack, come ogni altra modifica di props di questo file.
            // `onTextInput`/`onHtmlInput`/`onLabelInput` (ad ogni tasto) dispatchano invece
            // con debounce (`scheduleDebouncedUpdate`, punto 1 del task) — il `blur`
            // corrispondente cancella sempre il debounce pendente prima del proprio dispatch
            // immediato, così non corrono mai in coppia contro lo stesso valore stantio. Il
            // tipo del nodo decide quale coppia è pertinente — `Heading`/`RichText`/`Button`
            // ignorano le altre due.
            editing={
              isSelected
                ? {
                    editable: true,
                    onTextChange: (nextText) => {
                      cancelDebouncedUpdate();
                      updateBlockPropsAction(id, { text: nextText });
                    },
                    onTextInput: (nextText) => scheduleDebouncedUpdate({ text: nextText }),
                    onHtmlChange: commitHtml,
                    onHtmlInput: (nextHtml) => scheduleDebouncedUpdate({ html: nextHtml }),
                    onLabelChange: (nextLabel) => {
                      cancelDebouncedUpdate();
                      updateBlockPropsAction(id, { label: nextLabel });
                    },
                    onLabelInput: (nextLabel) => scheduleDebouncedUpdate({ label: nextLabel }),
                  }
                : undefined
            }
          />
        )}

        {confirmOpened && (
          <ConfirmModal
            opened
            onClose={() => setConfirmOpened(false)}
            onConfirm={() => {
              removeBlockAction(id);
              setConfirmOpened(false);
            }}
            title={`Elimina blocco "${label}"`}
            confirmLabel="Elimina"
            confirmColor="red"
            // Stesso motivo/stesso valore del `ConfirmModal` di `BlockEditorPanel.tsx` e
            // della tendina di stato in `PagePageDetail.tsx`: sopra la chrome full-screen
            // dell'editor (z-index 1000, `FullScreenEditorLayout.module.css`). Il Modal è
            // montato in portale (default Mantine), fuori dal wrapper del blocco che lo
            // apre: senza questo z-index esplicito il suo bottone "Elimina" resterebbe
            // dietro l'overlay, mai cliccabile.
            zIndex={1100}
          >
            {childIds.length > 0
              ? `Il blocco e i suoi ${childIds.length} blocchi figli vengono rimossi dalla bozza. L'eliminazione diventa definitiva al salvataggio.`
              : "Il blocco viene rimosso dalla bozza. L'eliminazione diventa definitiva al salvataggio."}
          </ConfirmModal>
        )}

        {/*
          "Salva come Preset Globale" (F14-01): stesso pattern di nome-e-conferma già in
          uso da `AdvancedTab.tsx` per container/section, stesso `usePresetStore` — un solo
          registro di preset condiviso fra i due punti d'ingresso, mai due copie del
          Modal/della logica di salvataggio.
        */}
        {presetModalOpened && (
          <Modal
            opened
            onClose={() => setPresetModalOpened(false)}
            title="Salva come Preset Globale"
            centered
            zIndex={1100}
          >
            <Stack>
              <TextInput
                label="Nome del preset"
                placeholder="Es. Hero aziendale"
                value={presetName}
                onChange={(event) => setPresetName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSavePreset();
                }}
                data-autofocus
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setPresetModalOpened(false)}>
                  Annulla
                </Button>
                <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
                  Salva
                </Button>
              </Group>
            </Stack>
          </Modal>
        )}

        {/*
          "Converti in Sezione Globale" (ADR-55): stesso `ConvertToGlobalSectionModal.tsx`
          montato anche da `AdvancedTab.tsx` (Property Inspector) — un solo componente, mai
          due implementazioni del nome+conferma. `key={id}` azzera il nome digitato e lo
          stato di caricamento se l'utente cambia selezione a modal aperto (raro, ma
          altrimenti un secondo blocco erediterebbe lo stato residuo del primo).
        */}
        {convertModalOpened && (
          <ConvertToGlobalSectionModal
            key={id}
            opened
            onClose={() => setConvertModalOpened(false)}
            onConfirm={(title) => convertToGlobalSectionAction(id, title)}
            blockLabel={label}
          />
        )}

        {/*
          Zona di rilascio "dopo questo nodo": chiude l'ultimo gap del suo livello.
          Stessa ragione della zona "prima" più sopra: annidata qui dentro invece che
          fratello del wrapper, per non diventare un grid item vero in una `section` a
          più colonne (T-layout-colonne-section).
        */}
        <div
          ref={setDropAfterRef}
          className={`${styles.dropZone} ${styles.dropZoneAfter}`}
          {...dropZoneAttrs(isOverAfter, activeDragId, activeDragType, location.parentId)}
        />
      </div>
    </>
  );
});

export default EditorBlockWrapper;

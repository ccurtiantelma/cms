/**
 * Tipi delle props dei componenti montati in `CONTAINER_COMPONENTS` (F02 T8, ADR-39/46/52/57/59).
 * Tutte dichiarano solo `children` come obbligatoria e ogni altra prop `unknown`: la narrowing
 * avviene negli adapter (`composite-adapters.tsx`) o nei componenti puri condivisi col sito pubblico.
 */
import type { ReactNode } from 'react';

export interface SectionContainerProps {
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
export interface ContainerBlockProps {
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
  defaultDirection?: 'row' | 'column';
  /**
   * Valore grezzo di `layout`, passato **solo** qui (non dal Runtime Style Bridge, invariato)
   * per l'overlay editor-only "Contorno griglia" (T-container-layout-tab,
   * `grid-outline.utils.ts`) — vedi il commento di testa di `Container.tsx`.
   */
  layout?: unknown;
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
export interface GalleryBlockContainerProps {
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
export interface FormBlockContainerProps {
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
export interface NavMenuContainerProps {
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
export interface AccordionItemContainerProps {
  children: ReactNode;
  title?: unknown;
  groupName?: unknown;
}

export interface TabPanelContainerProps {
  children: ReactNode;
  label?: unknown;
  groupName?: unknown;
  defaultChecked?: unknown;
}

export interface CarouselContainerProps {
  children: ReactNode;
  transition?: unknown;
}

export interface CarouselSlideContainerProps {
  children: ReactNode;
  slideId?: unknown;
  transition?: unknown;
  index?: unknown;
  count?: unknown;
}

export interface ModalTriggerContainerProps {
  children: ReactNode;
  nodeId?: unknown;
  triggerLabel?: unknown;
  animation?: unknown;
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
export type ContainerComponentProps =
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

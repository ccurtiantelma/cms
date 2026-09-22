/**
 * Mappa tipo → componente di contenuto per i blocchi contenitore (F02 T8, ADR-39/46/52/57/59).
 * La chrome dell'editor si inserisce *fra* il contenitore e i suoi figli riusando gli stessi
 * componenti del sito pubblico, mai una loro riscrittura. Tipi in `container-props.types.ts`,
 * adapter dei compositi in `composite-adapters.tsx`.
 *
 * I figli dei sette widget compositi (ADR-59) ricorrono qui, non in `BlockRenderer.tsx` (unico
 * dispatcher per `app/public-site`): un `EditorBlockWrapper` per figlio, con la propria chrome.
 */
import Section from '../../../../components/blocks/blocks/Section';
import Container from '../../../../components/blocks/blocks/Container';
import FormBlock from '../../../../components/blocks/blocks/FormBlock';
import NavMenuBlock from '../../../../components/blocks/blocks/NavMenuBlock';
import AccordionBlock from '../../../../components/blocks/blocks/AccordionBlock';
import TabsBlock from '../../../../components/blocks/blocks/TabsBlock';
import GalleryBlock from '../../../../components/blocks/blocks/GalleryBlock';
import {
  AccordionItemContainer,
  CarouselContainer,
  CarouselSlideContainer,
  ModalTriggerContainer,
  TabPanelContainer,
} from './composite-adapters';
import type { ContainerComponentProps } from './container-props.types';

export const CONTAINER_COMPONENTS: Record<string, (props: ContainerComponentProps) => JSX.Element> =
  {
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

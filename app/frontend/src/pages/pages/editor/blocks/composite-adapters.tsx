/**
 * Adapter dei widget compositi CSS-only (ADR-57 § 2, ADR-59) verso i componenti puri di
 * `components/blocks/blocks/`, che dichiarano props strutturali obbligatorie e strette
 * (`title: string`, `transition: CarouselEffectiveTransition`, …). Qui la narrowing avviene
 * all'ultimo istante con la stessa logica difensiva di `BlockRenderer.tsx`; il *valore* è già
 * derivato da `resolveContainerComponentProps`. `accordion`/`tabs` non servono un adapter.
 */
import AccordionItemBlock from '../../../../components/blocks/blocks/AccordionItemBlock';
import TabPanelBlock from '../../../../components/blocks/blocks/TabPanelBlock';
import CarouselBlock from '../../../../components/blocks/blocks/CarouselBlock';
import CarouselSlideBlock from '../../../../components/blocks/blocks/CarouselSlideBlock';
import ModalTriggerBlock from '../../../../components/blocks/blocks/ModalTriggerBlock';
import type {
  AccordionItemContainerProps,
  TabPanelContainerProps,
  CarouselContainerProps,
  CarouselSlideContainerProps,
  ModalTriggerContainerProps,
} from './container-props.types';

/** Adapter di `accordionItem` verso `AccordionItemBlock`. */
export function AccordionItemContainer({
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

/** Adapter di `tabPanel` verso `TabPanelBlock`. */
export function TabPanelContainer({
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

/** Adapter di `carousel` verso `CarouselBlock`. */
export function CarouselContainer({ children, transition }: CarouselContainerProps): JSX.Element {
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

/** Adapter di `carouselSlide` verso `CarouselSlideBlock`. */
export function CarouselSlideContainer({
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

/** Adapter di `modalTrigger` verso `ModalTriggerBlock`. */
export function ModalTriggerContainer({
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

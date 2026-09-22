/**
 * Wrapper per un controllo dell'editor senza logica attiva (ADR-94): lo rende visivamente
 * disabilitato e mostra sull'hover il tooltip "In costruzione".
 *
 * Il tooltip vive sul wrapper, non sul controllo: un elemento `disabled` non emette eventi di
 * puntatore, quindi Mantine non vedrebbe mai l'hover. Il contenuto è `inert` (non cliccabile,
 * non focalizzabile da tastiera, escluso dall'albero di accessibilità interattivo) invece di
 * affidarsi al solo `pointer-events: none`, che lascerebbe raggiungibile il controllo via Tab.
 */
import type { ReactNode } from 'react';
import { Tooltip } from '@mantine/core';
import styles from './UnderConstruction.module.css';

export const UNDER_CONSTRUCTION_LABEL = 'In costruzione';

export interface UnderConstructionProps {
  children: ReactNode;
}

export default function UnderConstruction({ children }: UnderConstructionProps): JSX.Element {
  return (
    <Tooltip label={UNDER_CONSTRUCTION_LABEL} openDelay={150} withinPortal>
      <div className={styles.root} aria-disabled="true" data-under-construction="true">
        <div className={styles.content} inert>
          {children}
        </div>
      </div>
    </Tooltip>
  );
}

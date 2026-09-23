/**
 * Le tre schede dell'ispettore delle proprietà (Contenuto/Stile/Avanzato, ADR-30 § 1,
 * ADR-37 § 5): estratto da `PropertyInspector.tsx` (T-inspector-restyle) come componente
 * riusabile, stesso comportamento, zero regressioni sugli invarianti già testati in
 * `PropertyInspector.test.tsx`:
 *
 * - una scheda **senza** props dichiarate non compare — mai una scheda vuota. Qui si esprime
 *   passando `undefined` (non un nodo vuoto) per la sezione che non ha campi: `PropertyInspector`
 *   decide *cosa* passare, questo componente decide solo *come* mostrarlo;
 * - con una sola sezione popolata non compaiono i `Tabs` (né i `role="tab"` che la suite di
 *   test interroga): si monta il solo contenuto, senza chrome a schede attorno.
 *
 * Chrome dell'editor → Mantine v7 obbligatorio (CLAUDE.md § Regola Mantine): `Tabs` di
 * `@mantine/core`, non l'implementazione precedente a bottoni HTML nudi + CSS Module (che
 * violava quella regola ed è stata sostituita qui, non altrove — nessun secondo file).
 */
import type { ReactNode } from 'react';
import { Tabs } from '@mantine/core';
import { IconBrush, IconLayoutGrid, IconPencil, IconSettings } from '@tabler/icons-react';
import styles from './InspectorTabs.module.css';

export type InspectorTab = 'content' | 'style' | 'advanced';

export interface InspectorTabsProps {
  /**
   * Contenuto della prima scheda: "Contenuto" (testi, URL immagini, tag HTML) per ogni tipo,
   * "Layout" (`ContainerLayoutTab.tsx`, T-container-layout-tab) per `container`/`section`
   * (ADR-82: `container` v2 attivo, `section` v1 deprecato ma ancora leggibile) — `undefined`
   * = scheda assente, stesso invariante di sempre.
   */
  content?: ReactNode;
  /** Contenuto della scheda "Stile" (colori, dimensioni font, allineamento) — `undefined` = scheda assente. */
  style?: ReactNode;
  /** Contenuto della scheda "Avanzato" (margin, padding, classi/ID custom) — `undefined` = scheda assente. */
  advanced?: ReactNode;
  /**
   * Tipo del nodo selezionato: decide solo l'etichetta/icona della prima scheda
   * ("Layout" + `IconLayoutGrid` per `container`/`section`, "Contenuto" + `IconPencil` per
   * ogni altro tipo), mai una quarta via di dispaccio per tipo — il contenuto della scheda
   * resta deciso da `PropertyInspector.tsx` (`content` sopra), questo componente sceglie solo
   * *come* etichettarla.
   */
  nodeType?: string;
}

const CONTAINER_LIKE_TYPES = new Set(['container', 'section']);

export default function InspectorTabs({
  content,
  style,
  advanced,
  nodeType,
}: InspectorTabsProps): JSX.Element | null {
  const isContainerLike = nodeType !== undefined && CONTAINER_LIKE_TYPES.has(nodeType);
  const tabDefs: readonly { value: InspectorTab; label: string; icon: ReactNode }[] = [
    isContainerLike
      ? { value: 'content', label: 'Layout', icon: <IconLayoutGrid size={14} /> }
      : { value: 'content', label: 'Contenuto', icon: <IconPencil size={14} /> },
    { value: 'style', label: 'Stile', icon: <IconBrush size={14} /> },
    { value: 'advanced', label: 'Avanzato', icon: <IconSettings size={14} /> },
  ];
  const sections: Record<InspectorTab, ReactNode | undefined> = { content, style, advanced };
  const availableTabs = tabDefs.filter((tab) => sections[tab.value] !== undefined);

  if (availableTabs.length === 0) return null;

  // Un'unica scheda popolata: nessuna chrome a tab, solo il contenuto (stesso invariante
  // già testato su `PropertyInspector.tsx` prima dell'estrazione).
  if (availableTabs.length === 1) {
    return <div className={styles.root}>{sections[availableTabs[0].value]}</div>;
  }

  return (
    <div className={styles.root}>
      <Tabs defaultValue={availableTabs[0].value} keepMounted={false} color="blue">
        <Tabs.List grow>
          {availableTabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {availableTabs.map((tab) => (
          <Tabs.Panel key={tab.value} value={tab.value} pt="md">
            {sections[tab.value]}
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}

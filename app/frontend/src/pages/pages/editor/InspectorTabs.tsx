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
import styles from './InspectorTabs.module.css';

export type InspectorTab = 'content' | 'style' | 'advanced';

export interface InspectorTabsProps {
  /** Contenuto della scheda "Contenuto" (testi, URL immagini, tag HTML) — `undefined` = scheda assente. */
  content?: ReactNode;
  /** Contenuto della scheda "Stile" (colori, dimensioni font, allineamento) — `undefined` = scheda assente. */
  style?: ReactNode;
  /** Contenuto della scheda "Avanzato" (margin, padding, classi/ID custom) — `undefined` = scheda assente. */
  advanced?: ReactNode;
}

const TAB_DEFS: readonly { value: InspectorTab; label: string }[] = [
  { value: 'content', label: 'Contenuto' },
  { value: 'style', label: 'Stile' },
  { value: 'advanced', label: 'Avanzato' },
];

export default function InspectorTabs({
  content,
  style,
  advanced,
}: InspectorTabsProps): JSX.Element | null {
  const sections: Record<InspectorTab, ReactNode | undefined> = { content, style, advanced };
  const availableTabs = TAB_DEFS.filter((tab) => sections[tab.value] !== undefined);

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
            <Tabs.Tab key={tab.value} value={tab.value}>
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

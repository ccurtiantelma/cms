/**
 * `tabPanel` (ADR-57 § 2): radio-hack CSS-only isolato (input + label + pannello), foglia del
 * contenitore `tabs`. Suite dedicata al componente — la condivisione del `groupName`/il primo
 * pannello `checked` di default sono coperti in `TabsBlock.test.tsx` (dispatch di
 * `BlockRenderer`, l'unico punto che li calcola per l'intero gruppo di fratelli).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabPanelBlock from './TabPanelBlock';

describe('TabPanelBlock', () => {
  it('mostra l\'etichetta cliccabile e il contenuto del pannello', () => {
    render(
      <TabPanelBlock label="Scheda" groupName="grp-1">
        Corpo del pannello
      </TabPanelBlock>,
    );

    expect(screen.getByText('Scheda').tagName).toBe('LABEL');
    expect(screen.getByText('Corpo del pannello')).toBeInTheDocument();
  });

  it('applica `groupName` come attributo `name` del radio nascosto', () => {
    render(
      <TabPanelBlock label="Scheda" groupName="grp-1">
        Corpo
      </TabPanelBlock>,
    );

    expect((screen.getByLabelText('Scheda') as HTMLInputElement).name).toBe('grp-1');
  });

  it('`defaultChecked` di default è `false`', () => {
    render(
      <TabPanelBlock label="Scheda" groupName="grp-1">
        Corpo
      </TabPanelBlock>,
    );

    expect(screen.getByLabelText('Scheda')).not.toBeChecked();
  });

  it('`defaultChecked:true` marca il radio come selezionato', () => {
    render(
      <TabPanelBlock label="Scheda" groupName="grp-1" defaultChecked>
        Corpo
      </TabPanelBlock>,
    );

    expect(screen.getByLabelText('Scheda')).toBeChecked();
  });

  it('due istanze generano id univoci per la coppia input/label (useId)', () => {
    render(
      <>
        <TabPanelBlock label="Uno" groupName="grp-1">
          Contenuto 1
        </TabPanelBlock>
        <TabPanelBlock label="Due" groupName="grp-1">
          Contenuto 2
        </TabPanelBlock>
      </>,
    );

    const uno = screen.getByLabelText('Uno') as HTMLInputElement;
    const due = screen.getByLabelText('Due') as HTMLInputElement;
    expect(uno.id).not.toBe(due.id);
  });
});

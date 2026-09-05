/**
 * `accordionItem` (ADR-57 § 2): `<details>/<summary>` nativi, foglia del contenitore
 * `accordion`. Suite dedicata al componente isolato — la condivisione del `groupName` fra
 * fratelli è coperta in `AccordionBlock.test.tsx` (dispatch di `BlockRenderer`, l'unico punto
 * che la calcola).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccordionItemBlock from './AccordionItemBlock';

describe('AccordionItemBlock', () => {
  it('mostra il titolo nello `<summary>` e il contenuto nel pannello', () => {
    render(<AccordionItemBlock title="Domanda frequente">Risposta</AccordionItemBlock>);

    expect(screen.getByText('Domanda frequente').tagName).toBe('SUMMARY');
    expect(screen.getByText('Risposta')).toBeInTheDocument();
  });

  it('senza `groupName` non applica alcun attributo `name` al `<details>`', () => {
    render(<AccordionItemBlock title="Domanda">Risposta</AccordionItemBlock>);

    expect(screen.getByText('Domanda').closest('details')).not.toHaveAttribute('name');
  });

  it('con `groupName` applica esattamente quel valore come attributo `name`', () => {
    render(
      <AccordionItemBlock title="Domanda" groupName="accordion-xyz">
        Risposta
      </AccordionItemBlock>,
    );

    expect(screen.getByText('Domanda').closest('details')).toHaveAttribute(
      'name',
      'accordion-xyz',
    );
  });

  it('nessun attributo `open`: ogni voce parte chiusa per default (comportamento nativo di `<details>`)', () => {
    render(<AccordionItemBlock title="Domanda">Risposta</AccordionItemBlock>);

    expect(screen.getByText('Domanda').closest('details')).not.toHaveAttribute('open');
  });
});

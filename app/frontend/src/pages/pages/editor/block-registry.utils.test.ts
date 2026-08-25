/**
 * Unit test di `canDropInto` (PLAN-F04c-editor-maturo.md T7 § Parte 2, T8).
 *
 * `canDropInto` è un predicato **composto**: la guardia di discendenza è la stessa
 * `isDescendantOf` già esercitata da `moveNodeTo` in `block-tree.utils.test.ts`, e
 * l'ammissibilità del tipo è la stessa `canContainType` esercitata indirettamente da
 * `moveNodeToAction` in `useBlockEditorStore.test.ts`. Questo file non ripete quella
 * matrice: copre solo i casi che il drag & drop reale introduce sul predicato composto
 * stesso (§ Criterio di Done di T7: "un drop non ammesso è visibile durante l'hover").
 */
import { describe, it, expect } from 'vitest';
import { canDropInto } from './block-registry.utils';
import type { BlockNode } from './block-tree.utils';

/** Nodo di comodo con `children` sempre presente. */
function node(id: string, type: string, children: BlockNode[] = []): BlockNode {
  return { id, type, props: {}, children };
}

/** `section` (che ammette heading) con un figlio, più un heading di radice. */
function makeTree(): BlockNode[] {
  return [node('sec-1', 'section', [node('head-1', 'heading')]), node('head-root', 'heading')];
}

describe('canDropInto — drag & drop reale (T7): solo i casi nuovi sul predicato composto', () => {
  it('caso ammesso: un heading di radice può entrare nella section esistente (canContainType soddisfatto)', () => {
    expect(canDropInto(makeTree(), 'head-root', 'sec-1')).toBe(true);
  });

  it('tipo non ammesso dal contenitore di destinazione: false (heading non ha childrenAllow)', () => {
    expect(canDropInto(makeTree(), 'head-root', 'head-1')).toBe(false);
  });

  it('un nodo non può essere trascinato "dentro" se stesso', () => {
    expect(canDropInto(makeTree(), 'sec-1', 'sec-1')).toBe(false);
  });

  it('il nodo trascinato non esiste più nell’albero (rimosso durante il gesto): false, mai un’eccezione', () => {
    expect(canDropInto(makeTree(), 'mai-esistito', 'sec-1')).toBe(false);
  });

  it('il contenitore di destinazione non esiste più: false, mai un’eccezione', () => {
    expect(canDropInto(makeTree(), 'head-root', 'mai-esistito')).toBe(false);
  });

  it('destinazione radice (null): ammesso se il tipo è in ROOT_ALLOWED', () => {
    expect(canDropInto(makeTree(), 'head-1', null)).toBe(true);
  });
});

/**
 * Guardia anti-corruzione contro l'annidamento di `section` dentro `section`: il registro
 * non dichiara `'section'` fra i `childrenAllow` di `section` (unico contenitore del
 * primo rilascio, ADR-21 § 5; l'annidamento resta debito di governance non richiuso da
 * ADR-31 § Decisione 8), quindi `canContainType`/`canDropInto` lo rifiutano già per
 * costruzione — questo blocco lo rende un invariante esplicito e testato, non solo
 * un effetto collaterale del registro corrente.
 */
describe('canDropInto — anti-corruzione: nessun annidamento di section dentro section', () => {
  /** Due section indipendenti, nessuna già annidata nell'altra. */
  function makeTwoSections(): BlockNode[] {
    return [node('sec-outer', 'section', [node('head-1', 'heading')]), node('sec-inner', 'section')];
  }

  it('una section esistente non può entrare in un\'altra section (spostamento di un nodo reale)', () => {
    expect(canDropInto(makeTwoSections(), 'sec-inner', 'sec-outer')).toBe(false);
  });

  it('una section nuova trascinata dalla palette (dragType, nodo non ancora nell\'albero) non può entrare in una section', () => {
    expect(canDropInto(makeTwoSections(), 'new-block:section', 'sec-outer', 'section')).toBe(false);
  });

  it('una section resta invece ammessa alla radice (unico livello legale per questo tipo)', () => {
    expect(canDropInto(makeTwoSections(), 'sec-inner', null)).toBe(true);
  });
});

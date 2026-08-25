import {
  PAGE_STATUS_TRANSITIONS,
  auditActionForStatusTransition,
  isTransitionAllowed,
  statusTransitionRequiresElevation,
} from '../../../src/pages/pages.state-machine';

/**
 * Unit test puri della macchina a stati di `pages.state-machine.ts` (F01/T5).
 * Nessuna dipendenza da DB/Redis/Nest: la costante `PAGE_STATUS_TRANSITIONS`
 * e le funzioni derivate sono testabili in isolamento.
 */
describe('pages.state-machine', () => {
  describe('published -> published (ripubblicazione esplicita, business-rules.md § "Stati di una Pagina e transizioni", Regola 1)', () => {
    it('isTransitionAllowed("published", "published") è true', () => {
      expect(isTransitionAllowed('published', 'published')).toBe(true);
    });

    it('la mappa delle transizioni elenca "published" tra i target ammessi da "published"', () => {
      expect(PAGE_STATUS_TRANSITIONS.published).toContain('published');
      // Le altre due transizioni da "published" restano invariate.
      expect(PAGE_STATUS_TRANSITIONS.published).toEqual(
        expect.arrayContaining(['draft', 'archived']),
      );
      expect(PAGE_STATUS_TRANSITIONS.published).toHaveLength(3);
    });

    it('richiede ancora la soglia elevata (Manager+): nessuna eccezione introdotta per l\'auto-transizione', () => {
      expect(statusTransitionRequiresElevation('published')).toBe(true);
    });

    it('l\'azione di audit resta "pages.publish", come ogni altra transizione verso "published"', () => {
      expect(auditActionForStatusTransition('published', 'published')).toBe('pages.publish');
    });
  });

  describe('transizioni invariate (regressione)', () => {
    it.each([
      ['draft', 'review', true],
      ['draft', 'scheduled', true],
      ['draft', 'published', true],
      ['draft', 'archived', false],
      ['review', 'draft', true],
      ['review', 'scheduled', true],
      ['review', 'published', true],
      ['review', 'archived', false],
      ['scheduled', 'draft', true],
      ['scheduled', 'published', true],
      ['scheduled', 'archived', true],
      ['scheduled', 'review', false],
      ['published', 'draft', true],
      ['published', 'archived', true],
      ['published', 'scheduled', false],
      ['archived', 'draft', true],
      ['archived', 'published', true],
      ['archived', 'scheduled', false],
    ] as const)('isTransitionAllowed(%s, %s) === %s', (from, to, expected) => {
      expect(isTransitionAllowed(from, to)).toBe(expected);
    });

    it('solo la transizione verso "review" non richiede la soglia elevata', () => {
      expect(statusTransitionRequiresElevation('review')).toBe(false);
      expect(statusTransitionRequiresElevation('draft')).toBe(true);
      expect(statusTransitionRequiresElevation('scheduled')).toBe(true);
      expect(statusTransitionRequiresElevation('published')).toBe(true);
      expect(statusTransitionRequiresElevation('archived')).toBe(true);
    });
  });

  describe('valori sconosciuti', () => {
    it('isTransitionAllowed rifiuta un target fuori dai cinque stati ammessi', () => {
      expect(isTransitionAllowed('draft', 'deleted-forever')).toBe(false);
    });
  });
});

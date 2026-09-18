import {
  DynamicDataContext,
  extractDynamicTokens,
  hasDynamicTokens,
  resolveDynamicTokens,
} from '../../../src/common/dynamic-data-token.resolver';

describe('dynamic-data-token.resolver', () => {
  const context: DynamicDataContext = {
    page: { title: 'Chi siamo', slug: 'chi-siamo', publishedAt: '2026-09-18T10:00:00.000Z' },
    user: { name: 'Mario Rossi' },
  };

  describe('resolveDynamicTokens', () => {
    it('sostituisce un singolo token con il valore risolto', () => {
      expect(resolveDynamicTokens('{{page.title}}', context)).toBe('Chi siamo');
    });

    it('sostituisce più token nella stessa stringa', () => {
      expect(resolveDynamicTokens('{{page.title}} — {{page.slug}}', context)).toBe(
        'Chi siamo — chi-siamo',
      );
    });

    it('tollera spazi interni al token', () => {
      expect(resolveDynamicTokens('{{ page.title }}', context)).toBe('Chi siamo');
    });

    it('lascia invariato il testo circostante', () => {
      expect(resolveDynamicTokens('Benvenuto su {{page.title}}!', context)).toBe(
        'Benvenuto su Chi siamo!',
      );
    });

    it('risolve un valore Date in ISO string', () => {
      const withDate: DynamicDataContext = {
        page: { publishedAt: new Date('2026-01-01T00:00:00.000Z') },
      };
      expect(resolveDynamicTokens('{{page.publishedAt}}', withDate)).toBe(
        '2026-01-01T00:00:00.000Z',
      );
    });

    it('usa il fallback (stringa vuota di default) per un namespace assente dal contesto', () => {
      expect(resolveDynamicTokens('{{site.name}}', context)).toBe('');
    });

    it('usa il fallback per una chiave assente nel namespace', () => {
      expect(resolveDynamicTokens('{{page.unknownField}}', context)).toBe('');
    });

    it('usa il fallback per un valore null/undefined nel contesto', () => {
      const ctx: DynamicDataContext = { page: { title: null } };
      expect(resolveDynamicTokens('{{page.title}}', ctx)).toBe('');
    });

    it('accetta un fallback personalizzato', () => {
      expect(resolveDynamicTokens('{{site.name}}', context, '—')).toBe('—');
    });

    it('usa il fallback per un valore non scalare (oggetto/array)', () => {
      const ctx: DynamicDataContext = { page: { title: ['non', 'scalare'] as unknown as string } };
      expect(resolveDynamicTokens('{{page.title}}', ctx)).toBe('');
    });

    it("non lancia eccezioni e restituisce l'input su token malformati", () => {
      expect(resolveDynamicTokens('{{page.title', context)).toBe('{{page.title');
      expect(resolveDynamicTokens('{{page}}', context)).toBe('{{page}}');
      expect(resolveDynamicTokens('', context)).toBe('');
    });

    it("restituisce input non-stringa così com'è, senza lanciare", () => {
      expect(resolveDynamicTokens(undefined as unknown as string, context)).toBeUndefined();
      expect(resolveDynamicTokens(null as unknown as string, context)).toBeNull();
    });

    it('è riutilizzabile su chiamate successive senza stato residuo (no lastIndex leak)', () => {
      expect(resolveDynamicTokens('{{page.title}}', context)).toBe('Chi siamo');
      expect(resolveDynamicTokens('{{page.title}}', context)).toBe('Chi siamo');
      expect(hasDynamicTokens('{{page.title}}')).toBe(true);
      expect(resolveDynamicTokens('{{page.title}}', context)).toBe('Chi siamo');
    });
  });

  describe('extractDynamicTokens', () => {
    it('estrae namespace e chiave di ogni token trovato', () => {
      expect(extractDynamicTokens('{{page.title}} e {{user.name}}')).toEqual([
        { raw: '{{page.title}}', namespace: 'page', key: 'title' },
        { raw: '{{user.name}}', namespace: 'user', key: 'name' },
      ]);
    });

    it('restituisce un array vuoto se non ci sono token', () => {
      expect(extractDynamicTokens('Nessun token qui.')).toEqual([]);
      expect(extractDynamicTokens('')).toEqual([]);
    });
  });

  describe('hasDynamicTokens', () => {
    it('rileva la presenza di un token valido', () => {
      expect(hasDynamicTokens('Titolo: {{page.title}}')).toBe(true);
    });

    it('restituisce false in assenza di token o su token malformati', () => {
      expect(hasDynamicTokens('Testo semplice')).toBe(false);
      expect(hasDynamicTokens('{{page}}')).toBe(false);
      expect(hasDynamicTokens('')).toBe(false);
    });
  });
});

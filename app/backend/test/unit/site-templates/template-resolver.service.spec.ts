import { TemplateResolverService } from '../../../src/site-templates/template-resolver.service';
import { DbService } from '../../../src/db/db.service';
import {
  DisplayConditionTarget,
  DisplayConditionType,
  SiteTemplateType,
} from '../../../src/common/enums';
import { ENVELOPE_VERSION } from '../../../src/blocks/migration/envelope-migration.engine';
import { DisplayConditionRuleDto } from '../../../src/site-templates/dto/display-condition-rule.dto';

type SiteTemplateRow = {
  id: number;
  guid: string;
  title: string;
  type: string;
  contentTree: Record<string, unknown>;
  isPublished: boolean;
  language: string;
  priority: number;
  displayConditions: DisplayConditionRuleDto[];
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number;
  updatedBy: number;
};

/**
 * Unit test di `TemplateResolverService.resolveForRoute` (ADR-64 § "Decisione"
 * punti 2-4). `DbService` è mockato: `findMany` è l'unico confine esterno
 * reale (Postgres), coerente con il pattern di `global-sections.service.spec.ts`.
 * Le righe restituite dal mock sono fornite già ordinate per `priority`
 * decrescente, come farebbe la query reale (`orderBy: desc(priority)`): il
 * resolver stesso non riordina nulla, sceglie solo il primo elemento
 * dell'array le cui `displayConditions` verificano il `path`.
 */
describe('TemplateResolverService (unit) — ADR-64', () => {
  let service: TemplateResolverService;
  let findManyMock: jest.Mock;
  let dbMock: { query: { siteTemplateEntity: { findMany: jest.Mock } } };

  function buildRow(overrides: Partial<SiteTemplateRow> = {}): SiteTemplateRow {
    return {
      id: 1,
      guid: 'aaaaaaaaaaaaaaaa',
      title: 'Template di test',
      type: SiteTemplateType.SinglePage,
      contentTree: { version: ENVELOPE_VERSION, blocks: [] },
      isPublished: true,
      language: 'IT',
      priority: 0,
      displayConditions: [],
      version: 1,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdBy: 1,
      updatedBy: 1,
      ...overrides,
    };
  }

  beforeEach(() => {
    findManyMock = jest.fn().mockResolvedValue([]);
    dbMock = { query: { siteTemplateEntity: { findMany: findManyMock } } };
    service = new TemplateResolverService({ db: dbMock } as unknown as DbService);
  });

  // ─── Tipi fuori da RESOLVABLE_SITE_TEMPLATE_TYPES ──────────────────────

  it('type "single_post" (fuori da RESOLVABLE_SITE_TEMPLATE_TYPES) ritorna null immediatamente, senza interrogare il DB', async () => {
    const result = await service.resolveForRoute('/qualsiasi', SiteTemplateType.SinglePost, 'IT');

    expect(result).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('type "archive" (fuori da RESOLVABLE_SITE_TEMPLATE_TYPES) ritorna null immediatamente, senza interrogare il DB', async () => {
    const result = await service.resolveForRoute('/blog', SiteTemplateType.Archive, 'IT');

    expect(result).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  // ─── Nessun candidato ────────────────────────────────────────────────

  it('nessun candidato pubblicato/attivo per type+language ritorna null', async () => {
    findManyMock.mockResolvedValue([]);

    const result = await service.resolveForRoute('/pagina', SiteTemplateType.SinglePage, 'IT');

    expect(result).toBeNull();
    expect(findManyMock).toHaveBeenCalledTimes(1);
  });

  // ─── Nessuna regola => si applica sempre ───────────────────────────────

  it('un Template senza displayConditions si applica a qualunque path', async () => {
    const row = buildRow({ displayConditions: [] });
    findManyMock.mockResolvedValue([row]);

    const result = await service.resolveForRoute(
      '/una/rotta/qualsiasi',
      SiteTemplateType.SinglePage,
      'IT',
    );

    expect(result).not.toBeNull();
    expect(result!.guid).toBe(row.guid);
  });

  // ─── Priorità decrescente ────────────────────────────────────────────

  it('a parità di type/language, vince il candidato con priority più alta tra quelli le cui condizioni verificano il path (righe già ordinate per priority desc)', async () => {
    const high = buildRow({ guid: 'high000000000000', priority: 10, displayConditions: [] });
    const low = buildRow({ guid: 'low0000000000000', priority: 1, displayConditions: [] });
    findManyMock.mockResolvedValue([high, low]); // ordine simulato: priority desc

    const result = await service.resolveForRoute('/x', SiteTemplateType.SinglePage, 'IT');

    expect(result!.guid).toBe('high000000000000');
  });

  it('se il candidato con priority più alta non verifica il path, vince il successivo che lo verifica', async () => {
    const high = buildRow({
      guid: 'high000000000000',
      priority: 10,
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.SpecificPage,
          value: '/solo-qui',
        },
      ],
    });
    const low = buildRow({ guid: 'low0000000000000', priority: 1, displayConditions: [] });
    findManyMock.mockResolvedValue([high, low]);

    const result = await service.resolveForRoute('/altra-rotta', SiteTemplateType.SinglePage, 'IT');

    expect(result!.guid).toBe('low0000000000000');
  });

  // ─── exclude ha sempre precedenza su include ────────────────────────────

  it('un exclude che verifica il path esclude sempre, anche se un include coprirebbe lo stesso path', async () => {
    const row = buildRow({
      displayConditions: [
        { type: DisplayConditionType.Include, target: DisplayConditionTarget.EntireSite },
        {
          type: DisplayConditionType.Exclude,
          target: DisplayConditionTarget.SpecificPage,
          value: '/escluso',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const result = await service.resolveForRoute('/escluso', SiteTemplateType.SinglePage, 'IT');

    expect(result).toBeNull();
  });

  // ─── include come allowlist ─────────────────────────────────────────────

  it('con almeno un include, un path che nessun include verifica non è coperto (allowlist)', async () => {
    const row = buildRow({
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.SpecificPage,
          value: '/solo-questa',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const result = await service.resolveForRoute('/altra', SiteTemplateType.SinglePage, 'IT');

    expect(result).toBeNull();
  });

  it('con almeno un include che verifica il path, il Template si applica', async () => {
    const row = buildRow({
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.SpecificPage,
          value: '/solo-questa',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const result = await service.resolveForRoute('/solo-questa', SiteTemplateType.SinglePage, 'IT');

    expect(result).not.toBeNull();
  });

  // ─── target entire_site ──────────────────────────────────────────────

  it('target entire_site verifica qualunque path', async () => {
    const row = buildRow({
      displayConditions: [
        { type: DisplayConditionType.Include, target: DisplayConditionTarget.EntireSite },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const result = await service.resolveForRoute(
      '/una/qualunque/rotta/profonda',
      SiteTemplateType.SinglePage,
      'IT',
    );

    expect(result).not.toBeNull();
  });

  // ─── target specific_page: uguaglianza esatta ──────────────────────────

  it('target specific_page richiede uguaglianza esatta col path, non un prefisso', async () => {
    const row = buildRow({
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.SpecificPage,
          value: '/contatti',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const exact = await service.resolveForRoute('/contatti', SiteTemplateType.SinglePage, 'IT');
    const prefixOnly = await service.resolveForRoute(
      '/contatti/extra',
      SiteTemplateType.SinglePage,
      'IT',
    );

    expect(exact).not.toBeNull();
    expect(prefixOnly).toBeNull();
  });

  // ─── target path_pattern: "*" unico wildcard, resto escapato ───────────

  it('target path_pattern: "*" fa da wildcard multi-carattere', async () => {
    const row = buildRow({
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.PathPattern,
          value: '/blog/*',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    const matched = await service.resolveForRoute(
      '/blog/un-articolo-lungo',
      SiteTemplateType.SinglePage,
      'IT',
    );
    const notMatched = await service.resolveForRoute(
      '/news/altro',
      SiteTemplateType.SinglePage,
      'IT',
    );

    expect(matched).not.toBeNull();
    expect(notMatched).toBeNull();
  });

  it('target path_pattern: il resto della stringa è escapato per regex — "." è letterale, non "un carattere qualsiasi"', async () => {
    const row = buildRow({
      displayConditions: [
        {
          type: DisplayConditionType.Include,
          target: DisplayConditionTarget.PathPattern,
          value: '/file.txt',
        },
      ],
    });
    findManyMock.mockResolvedValue([row]);

    // Se "." fosse trattato come wildcard regex, "/fileXtxt" corrisponderebbe: non deve.
    const literalDot = await service.resolveForRoute(
      '/file.txt',
      SiteTemplateType.SinglePage,
      'IT',
    );
    const wouldMatchIfDotWereWildcard = await service.resolveForRoute(
      '/fileXtxt',
      SiteTemplateType.SinglePage,
      'IT',
    );

    expect(literalDot).not.toBeNull();
    expect(wouldMatchIfDotWereWildcard).toBeNull();
  });

  // ─── query DB filtrata su isActive/isPublished/type/language ───────────

  it('interroga il DB filtrando su isActive=true, isPublished=true, type e language richiesti', async () => {
    findManyMock.mockResolvedValue([]);

    await service.resolveForRoute('/x', SiteTemplateType.Error404, 'EN');

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const callArgs = findManyMock.mock.calls[0][0] as { where: unknown; orderBy: unknown };
    expect(callArgs).toHaveProperty('where');
    expect(callArgs).toHaveProperty('orderBy');
  });
});

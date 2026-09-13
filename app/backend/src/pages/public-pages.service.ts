import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { pageEntity, pageRevisionEntity } from '../db/schema';
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../blocks/block-registry';
import { BlockTreeValidatorService } from '../blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import { PublicPageDto, PublicPageTranslationDto } from './dto/public-page.dto';
import {
  extractLocalePrefix,
  HOME_SLUG,
  composePublicPath,
  MAX_PUBLIC_PATH_SEGMENTS,
  splitPathSegments,
} from './public-path.util';
import { PublicPageCacheService } from './public-page-cache.service';
import { SettingsService } from '../settings/settings.service';

type PageRow = typeof pageEntity.$inferSelect;

/**
 * Superficie pubblica di lettura delle Pagine (F03/T2, ADR-24). Sola lettura,
 * anonima, solo contenuto `published`: la macchina a stati e la pubblicazione
 * transazionale restano interamente nel dominio amministrativo
 * (`pages.service.ts`), qui non si scrive mai.
 *
 * Punto unico di risoluzione ({@link resolveByPath}): la cache Redis (T3,
 * ADR-23) vi si innesta come strato sopra, senza riscriverne la forma — il
 * percorso di risoluzione dal database resta quello di T2, invariato.
 */
@Injectable()
export class PublicPagesService {
  private readonly logger = new Logger(PublicPagesService.name);

  /**
   * Inietta l'accesso al DB e la stessa coppia validator/registro usata da
   * `PagesService` per la pipeline di lettura-tollerante (migrazione →
   * validazione), dietro `BLOCK_REGISTRY_TOKEN` (mai il registro importato
   * come costante fissa, stesso motivo di `PagesService`: un test e2e deve
   * poterlo sovrascrivere).
   */
  constructor(
    private readonly db: DbService,
    private readonly blockTreeValidator: BlockTreeValidatorService,
    @Inject(BLOCK_REGISTRY_TOKEN) private readonly blockRegistry: BlockRegistry,
    private readonly publicPageCache: PublicPageCacheService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Risolve un percorso pubblico già in forma canonica (ADR-24 § 4, la
   * canonicalizzazione è responsabilità del controller) alla Revisione
   * pubblicata corrispondente. `404` uniforme per ogni motivo di rifiuto
   * (inesistente, non pubblicata, riga incoerente, albero non migrabile o non
   * valido) — mai `403`, mai un `code` che distingua i casi (ADR-24 § 3).
   *
   * Strato di cache (T3, ADR-23): letta prima di consultare il database,
   * scritta solo sull'esito positivo — mai su un `404` (ADR-23 § 8, nessun
   * negative caching). Un errore Redis in lettura è assorbito da
   * {@link PublicPageCacheService} e non altera questo percorso: la lettura
   * cade sul database (ADR-23 § 7).
   */
  async resolveByPath(canonicalPath: string): Promise<PublicPageDto> {
    const multilingualConfig = await this.settingsService.getMultilingualConfig();
    const { locale, residualPath } = extractLocalePrefix(
      canonicalPath,
      multilingualConfig.active,
      multilingualConfig.default,
    );

    const cached = await this.publicPageCache.getCached(locale, residualPath);
    if (cached) {
      return cached;
    }

    const page = await this.resolvePageRow(locale, residualPath);

    if (page.status !== 'published') {
      throw new NotFoundException();
    }
    if (page.publishedRevisionId === null) {
      // Riga incoerente (`published` senza revisione online): mai un
      // fallback sulla bozza, log d'errore + 404 (ADR-24 § 2).
      this.logger.error(
        `Pagina guid=${page.guid} in stato "published" senza publishedRevisionId (riga incoerente).`,
      );
      throw new NotFoundException();
    }

    const revision = await this.db.db.query.pageRevisionEntity.findFirst({
      where: eq(pageRevisionEntity.id, page.publishedRevisionId),
    });
    if (!revision) {
      this.logger.error(
        `Pagina guid=${page.guid}: publishedRevisionId=${page.publishedRevisionId} non trovato (riga incoerente).`,
      );
      throw new NotFoundException();
    }

    const content = this.migrateAndValidateOrThrow(revision.content, page.guid);

    const dto: PublicPageDto = {
      title: revision.title,
      slug: revision.slug,
      locale: page.locale,
      content,
      seo: (revision.seo as Record<string, unknown>) ?? {},
      translations: await this.collectPublishedTranslations(page, multilingualConfig.default),
    };

    await this.publicPageCache.setCached(locale, residualPath, dto);
    return dto;
  }

  /**
   * Risolve un `guid` amministrativo di Pagina al proprio percorso pubblico
   * canonico (ADR-52 § 4, direzione inversa di {@link resolveByPath}): usata
   * dalla pipeline SSR di `app/public-site` per trasformare il `pageGuid`
   * persistito da un `navMenuItem` in un `href`. `404` uniforme per ogni
   * motivo di rifiuto (inesistente, soft-eliminata, non `published`, `guid`
   * malformato, catena di antenati incoerente/oltre il guardrail) — mai
   * `403`, stesso principio di {@link resolveByPath} (ADR-24 § 3). Nessuna
   * cache dedicata (ADR-52 § Conseguenze): lettura diretta dal database ad
   * ogni chiamata, la stessa chiave di cache di {@link resolveByPath} resta
   * l'unica invalidata per evento (ADR-23/ADR-40).
   *
   * Non legge `content`/revisione: l'unico scopo è produrre il percorso, non
   * riesporre il payload della Pagina (già coperto da `?path=`).
   */
  async resolveByGuid(guid: string): Promise<{ path: string }> {
    const page = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.guid, guid), eq(pageEntity.isActive, true)),
    });
    if (!page || page.status !== 'published') {
      throw new NotFoundException();
    }

    const multilingualConfig = await this.settingsService.getMultilingualConfig();
    return { path: await this.buildPublicPath(page, multilingualConfig.default) };
  }

  /**
   * Percorso pubblico canonico di una riga `pages`: risalita degli antenati
   * per `parentId` più il prefisso di lingua quando il Locale non è quello di
   * default (inverso di `extractLocalePrefix`, ADR-24 § 5). Unico punto che
   * compone un percorso pubblico a partire da una riga — {@link resolveByGuid}
   * e l'elenco delle traduzioni (PLAN-F05 T5) ne condividono il risultato, mai
   * due calcoli divergenti.
   *
   * @throws NotFoundException Catena di antenati interrotta o oltre il
   * guardrail anti-abuso (dato incoerente/ciclico): stesso principio di
   * `resolvePageRow` sul lato discesa.
   */
  private async buildPublicPath(page: PageRow, defaultLocale: string): Promise<string> {
    const segments: string[] = [page.slug];

    let parentId = page.parentId;
    let lookups = 0;
    while (parentId !== null) {
      if (lookups >= MAX_PUBLIC_PATH_SEGMENTS) {
        throw new NotFoundException();
      }
      const ancestor = await this.loadActiveById(parentId);
      segments.unshift(ancestor.slug);
      parentId = ancestor.parentId;
      lookups += 1;
    }

    // Home radice senza segmento proprio (ADR-52 § 4), prefisso di lingua e
    // forma canonica minuscola (ADR-24 § 4-5): `composePublicPath`, lo stesso
    // calcolo dell'export statico (ADR-65). Un `hreflang` che punta a un
    // redirect `308` sarebbe un difetto, non un dettaglio.
    return composePublicPath(page.locale, `/${segments.join('/')}`, defaultLocale);
  }

  /**
   * Le altre traduzioni **pubblicate** dello stesso gruppo (PLAN-F05 T5,
   * firmato il 2026-08-25). Materia prima per gli `hreflang`: questo endpoint
   * non genera markup, che appartiene a F07.
   *
   * La Pagina corrente è esclusa per costruzione (`locale <> page.locale`,
   * unico per gruppo dall'indice `pages_translation_group_locale_uq`): il
   * consumatore conosce già il proprio Locale e il percorso che ha richiesto.
   *
   * Una traduzione con la catena di antenati rotta non fa fallire la lettura
   * della Pagina che la cita: viene **saltata** con un warning. Un dato
   * incoerente su una riga vicina non deve togliere dal web una Pagina sana —
   * lo stesso criterio per cui `resolveByPath` logga e risponde `404` solo
   * sulla riga che sta servendo.
   */
  private async collectPublishedTranslations(
    page: PageRow,
    defaultLocale: string,
  ): Promise<PublicPageTranslationDto[]> {
    const siblings = await this.db.db.query.pageEntity.findMany({
      where: and(
        eq(pageEntity.translationGroupId, page.translationGroupId),
        eq(pageEntity.isActive, true),
        eq(pageEntity.status, 'published'),
        ne(pageEntity.locale, page.locale),
      ),
    });

    const translations: PublicPageTranslationDto[] = [];
    for (const sibling of siblings) {
      try {
        translations.push({
          locale: sibling.locale,
          path: await this.buildPublicPath(sibling, defaultLocale),
        });
      } catch {
        this.logger.warn(
          `Traduzione guid=${sibling.guid} (locale=${sibling.locale}) non risolvibile a un percorso pubblico: esclusa dall'elenco delle traduzioni.`,
        );
      }
    }
    return translations.sort((a, b) => a.locale.localeCompare(b.locale));
  }

  /** Una singola lettura per `id` fra le righe attive, per la risalita degli antenati; `404` se assente. */
  private async loadActiveById(id: number): Promise<PageRow> {
    const row = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.id, id), eq(pageEntity.isActive, true)),
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /**
   * Risoluzione iterativa per segmenti (ADR-24 § 1): scende un segmento alla
   * volta su `(locale, parentId, slug)` fra le righe attive, stesso predicato
   * dei due indici parziali `pages_slug_locale_root_uq`/`_child_uq`. `/`
   * risolve alla radice `home` (§ 7). Un path oltre il guardrail anti-abuso
   * è respinto senza consultare il database.
   */
  private async resolvePageRow(locale: string, canonicalPath: string): Promise<PageRow> {
    if (canonicalPath === '/') {
      return this.loadActiveBySlugAndParent(locale, null, HOME_SLUG);
    }

    const segments = splitPathSegments(canonicalPath);
    if (segments.length > MAX_PUBLIC_PATH_SEGMENTS) {
      throw new NotFoundException();
    }

    let parentId: number | null = null;
    let row: PageRow | undefined;
    for (const segment of segments) {
      row = await this.loadActiveBySlugAndParent(locale, parentId, segment);
      parentId = row.id;
    }
    // segments.length > 0 qui sempre (il caso '/' è gestito sopra), quindi
    // `row` è sempre stato assegnato almeno una volta.
    return row as PageRow;
  }

  /** Una singola lettura indicizzata di `(locale, parentId, slug)` fra le righe attive; `404` se assente. */
  private async loadActiveBySlugAndParent(
    locale: string,
    parentId: number | null,
    slug: string,
  ): Promise<PageRow> {
    const row = await this.db.db.query.pageEntity.findFirst({
      where: and(
        eq(pageEntity.locale, locale),
        eq(pageEntity.slug, slug),
        eq(pageEntity.isActive, true),
        parentId === null ? isNull(pageEntity.parentId) : eq(pageEntity.parentId, parentId),
      ),
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /**
   * Migrazione + validazione in lettura (ADR-21 § 3.7, ADR-23 § 8): stesso
   * pattern di `PagesService.migrateContentForRead`, ma con l'esito opposto
   * su un errore — qui **un solo nodo con issue rende l'intera pagina non
   * servibile** (`404`, mai un `contentIssues` esposto: quel campo è solo
   * per la superficie amministrativa, SPEC-F02-blocchi.md § 4.3). La riga a
   * database non cambia mai: nessun `UPDATE`, nessuna richiesta di `v` per
   * nodo (lettura-tollerante su contenuto potenzialmente pre-F02).
   */
  private migrateAndValidateOrThrow(
    rawContent: unknown,
    pageGuid: string,
  ): Record<string, unknown> {
    const envelope = this.asEnvelopeRecord(rawContent);
    const fromVersion = typeof envelope.version === 'number' ? envelope.version : 1;

    const envelopeOutcome = migrateEnvelope(envelope, fromVersion);
    if (envelopeOutcome.unsupported) {
      this.logger.warn(
        `Pagina guid=${pageGuid}: envelope non migrabile (versione ${envelopeOutcome.unsupported.version}, corrente ${envelopeOutcome.unsupported.current}).`,
      );
      throw new NotFoundException();
    }

    const blocksInput = this.asMigratableBlocks(envelopeOutcome.envelope.blocks);
    const migration = migrateBlockTree(blocksInput, this.blockRegistry);
    if (migration.errors.length > 0) {
      this.logger.warn(
        `Pagina guid=${pageGuid}: albero non migrabile (${migration.errors.length} nodo/i colpevole/i).`,
      );
      throw new NotFoundException();
    }

    const validation = this.blockTreeValidator.validateTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
    );
    if (!validation.valid) {
      this.logger.warn(
        `Pagina guid=${pageGuid}: albero non valido (${validation.errors.length} nodo/i colpevole/i).`,
      );
      throw new NotFoundException();
    }

    return { version: ENVELOPE_VERSION, blocks: migration.blocks };
  }

  /** Normalizza un contenuto grezzo (jsonb, potenzialmente malformato) in un record d'envelope trattabile. */
  private asEnvelopeRecord(rawContent: unknown): Record<string, unknown> {
    if (rawContent !== null && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
      return rawContent as Record<string, unknown>;
    }
    return { version: ENVELOPE_VERSION, blocks: [] };
  }

  /** Estrae `blocks` da un envelope migrato, tollerante a un valore assente/malformato (array vuoto). */
  private asMigratableBlocks(blocks: unknown): MigratableBlockNode[] {
    return Array.isArray(blocks) ? (blocks as MigratableBlockNode[]) : [];
  }
}

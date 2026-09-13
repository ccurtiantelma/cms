import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { pageEntity } from '../db/schema';
import { canonicalizePublicPath } from './public-path.util';

/** Coordinate di un file statico di Pagina: `locale` + percorso di slug senza prefisso di lingua. */
export interface PublicPageLocation {
  locale: string;
  path: string;
}

/** Percorso di una Pagina con quanto serve per decidere se accodarne export o tombstone. */
export interface PageExportTarget extends PublicPageLocation {
  pageGuid: string;
  published: boolean;
}

/**
 * Calcolo dei percorsi pubblici delle Pagine per gli eventi di export statico
 * (ADR-67, conformità di ADR-53: nessuna cache Redis pubblica). Non scrive e
 * non cancella nulla: restituisce le coordinate con cui `PagesService` accoda
 * export e tombstone. I percorsi si calcolano sempre dal database
 * (`parentId`, `translationGroupId`), mai per scansione.
 */
@Injectable()
export class PublicPageLocationService {
  private readonly logger = new Logger(PublicPageLocationService.name);

  /** Inietta l'accesso al database, unica fonte dei percorsi. */
  constructor(private readonly db: DbService) {}

  /** Percorso corrente di una Pagina, o `null` se la riga o la catena di antenati manca. */
  async resolveLocation(pageId: number): Promise<PublicPageLocation | null> {
    const page = await this.db.db.query.pageEntity.findFirst({
      where: eq(pageEntity.id, pageId),
      columns: { slug: true, parentId: true, locale: true },
    });
    if (!page) return null;

    const ancestorSlugs = await this.loadAncestorSlugs(page.parentId);
    if (ancestorSlugs === null) return null;

    return {
      locale: page.locale,
      path: canonicalizePublicPath('/' + [...ancestorSlugs, page.slug].join('/')),
    };
  }

  /**
   * La Pagina e tutto il suo sottoalbero, con percorso e stato. Da chiamare
   * **prima** di una scrittura che cambia `slug`/`parentId`/`isActive`, quando
   * i percorsi dei file già esportati sono ancora leggibili, e di nuovo dopo
   * per i percorsi nuovi. Un errore di calcolo non blocca la scrittura: si
   * logga e si restituisce un insieme vuoto.
   */
  async computeSubtreeTargets(pageId: number): Promise<PageExportTarget[]> {
    try {
      return await this.collectSubtreeTargets(pageId);
    } catch (err) {
      this.logger.error(
        `Impossibile calcolare i percorsi del sottoalbero per pageId=${pageId}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Le altre traduzioni **pubblicate** dello stesso gruppo (PLAN-F05 T5): il
   * loro file statico contiene l'elenco `hreflang` delle traduzioni, quindi
   * una transizione di stato su questa Pagina le rende stantie.
   */
  async publishedTranslationSiblings(pageId: number): Promise<PageExportTarget[]> {
    const page = await this.db.db.query.pageEntity.findFirst({
      where: eq(pageEntity.id, pageId),
      columns: { translationGroupId: true, locale: true },
    });
    if (!page) return [];

    const siblings = await this.db.db.query.pageEntity.findMany({
      where: and(
        eq(pageEntity.translationGroupId, page.translationGroupId),
        eq(pageEntity.isActive, true),
        eq(pageEntity.status, 'published'),
        ne(pageEntity.locale, page.locale),
      ),
      columns: { id: true, guid: true },
    });

    const targets: PageExportTarget[] = [];
    for (const sibling of siblings) {
      const location = await this.resolveLocation(sibling.id);
      if (location) {
        targets.push({ ...location, pageGuid: sibling.guid, published: true });
      }
    }
    return targets;
  }

  /** Slug degli antenati, dalla radice al genitore diretto; `null` se la catena è interrotta. */
  private async loadAncestorSlugs(parentId: number | null): Promise<string[] | null> {
    const slugs: string[] = [];
    let currentId = parentId;
    while (currentId !== null) {
      const row = await this.db.db.query.pageEntity.findFirst({
        where: eq(pageEntity.id, currentId),
        columns: { slug: true, parentId: true },
      });
      if (!row) return null;
      slugs.unshift(row.slug);
      currentId = row.parentId;
    }
    return slugs;
  }

  /**
   * Percorso di ogni nodo del sottoalbero, per livelli (BFS): ogni nodo eredita
   * i segmenti del padre invece di rifare la salita, una sola interrogazione
   * dei figli per nodo. Solo righe attive: una Pagina già soft-eliminata non ha
   * file da rimuovere né da riscrivere.
   */
  private async collectSubtreeTargets(rootId: number): Promise<PageExportTarget[]> {
    const root = await this.db.db.query.pageEntity.findFirst({
      where: eq(pageEntity.id, rootId),
      columns: { id: true, guid: true, slug: true, parentId: true, locale: true, status: true },
    });
    if (!root) return [];

    const ancestorSlugs = await this.loadAncestorSlugs(root.parentId);
    if (ancestorSlugs === null) return [];

    const targets: PageExportTarget[] = [];
    let frontier: {
      id: number;
      guid: string;
      slug: string;
      status: string;
      ancestorSlugs: string[];
    }[] = [{ id: root.id, guid: root.guid, slug: root.slug, status: root.status, ancestorSlugs }];

    while (frontier.length > 0) {
      const nextFrontier: typeof frontier = [];
      for (const node of frontier) {
        const segments = [...node.ancestorSlugs, node.slug];
        targets.push({
          pageGuid: node.guid,
          locale: root.locale,
          path: canonicalizePublicPath('/' + segments.join('/')),
          published: node.status === 'published',
        });

        const children = await this.db.db.query.pageEntity.findMany({
          where: and(eq(pageEntity.parentId, node.id), eq(pageEntity.isActive, true)),
          columns: { id: true, guid: true, slug: true, status: true },
        });
        for (const child of children) {
          nextFrontier.push({ ...child, ancestorSlugs: segments });
        }
      }
      frontier = nextFrontier;
    }

    return targets;
  }
}

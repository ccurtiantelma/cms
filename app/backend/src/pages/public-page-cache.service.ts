import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { pageEntity } from '../db/schema';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from '../common/audit-log.service';
import {
  BLOCK_REGISTRY_TOKEN,
  BlockRegistry,
  computeBlockRegistryToken,
} from '../blocks/block-registry';
import { CacheInvalidationQueueService } from '../queues/cache-invalidation-queue/cache-invalidation.queue.service';
import { PublicPageDto } from './dto/public-page.dto';
import { canonicalizePublicPath, HOME_SLUG } from './public-path.util';

/** Un percorso pubblico risolvibile: coordinate della chiave di cache (ADR-23 § 1). */
interface CacheableLocation {
  locale: string;
  path: string;
}

/**
 * Cache pubblica delle Pagine (F03/T3, ADR-23) e sua invalidazione. Strato
 * sopra `resolveByPath` (T2): non partecipa alla risoluzione, la legge prima
 * e la scrive dopo. Unico punto che conosce la forma della chiave
 * (`public:{reg}:page:{locale}:{path}`) e l'unico che calcola gli insiemi di
 * chiavi da cancellare — sempre dal database, mai con `SCAN` (ADR-23 § 5).
 */
@Injectable()
export class PublicPageCacheService {
  private readonly logger = new Logger(PublicPageCacheService.name);

  /** Calcolato una volta sola dal registro iniettato (mai da `DEFAULT_BLOCK_REGISTRY` fisso, ADR-23 § 2). */
  private readonly registryToken: string;

  /** Inietta DB/Redis/audit/coda di retry e calcola il token del registro dei blocchi iniettato (mai quello di produzione fisso). */
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly auditLogService: AuditLogService,
    private readonly cacheInvalidationQueue: CacheInvalidationQueueService,
    @Inject(BLOCK_REGISTRY_TOKEN) blockRegistry: BlockRegistry,
  ) {
    this.registryToken = computeBlockRegistryToken(blockRegistry);
  }

  private buildKey(locale: string, path: string): string {
    return `public:${this.registryToken}:page:${locale}:${path}`;
  }

  /**
   * Legge il payload cacheato, o `null` su cache miss **o** su qualunque
   * errore Redis (connessione assente/comando fallito): la lettura pubblica
   * cade sempre sul database, non produce mai un `5xx` (ADR-23 § 7).
   */
  async getCached(locale: string, path: string): Promise<PublicPageDto | null> {
    // `isReady()` prima di qualunque comando: con `maxRetriesPerRequest:
    // null` (config di RedisService, necessaria a BullMQ) un client
    // disconnesso non rigetta i comandi, li accoda in attesa di
    // riconnessione — bloccherebbe la lettura pubblica invece di farla
    // cadere sul database (ADR-23 § 7).
    if (!this.redis.isReady()) return null;
    try {
      return await this.redis.getJson<PublicPageDto>(this.buildKey(locale, path));
    } catch (err) {
      this.logger.warn(
        `Lettura cache pubblica fallita, si cade sul database: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Scrive il payload già risolto (dopo migrazione/validazione, mai prima —
   * ADR-23 § 1). Nessuna TTL (§ 3). Un errore Redis qui non deve mai
   * bloccare la risposta al pubblico che ha appena letto dal database: viene
   * solo loggato.
   */
  async setCached(locale: string, path: string, dto: PublicPageDto): Promise<void> {
    if (!this.redis.isReady()) return;
    try {
      await this.redis.set(this.buildKey(locale, path), dto);
    } catch (err) {
      this.logger.warn(
        `Scrittura cache pubblica fallita (non bloccante): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Invalida la sola chiave della Pagina indicata (pubblicazione,
   * ripubblicazione, spubblicazione, archiviazione — ADR-23 § 4): nessuna di
   * queste transizioni cambia `slug`/`parentId`, quindi il percorso dei
   * discendenti non è toccato. Eccezione dichiarata: la home (ADR-24 § 7) è
   * raggiungibile sia da `/` sia dal proprio segmento — due chiavi per la
   * stessa riga.
   */
  async invalidatePage(pageId: number, actingUserId: number): Promise<void> {
    const location = await this.resolveOwnLocation(pageId);
    if (!location) return;
    await this.invalidateKeys(this.expandHomeAliases(location), actingUserId);
  }

  /**
   * Invalida la Pagina indicata **e tutto il suo sottoalbero** (cambio di
   * slug, soft delete — ADR-23 § 4/§ 5): l'insieme si calcola qui dal
   * database (`parentId`), mai da `SCAN`. Da chiamare **prima** della
   * scrittura che cambia `slug`/`parentId`/`isActive`, quando il vecchio
   * percorso — quello davvero cacheato — è ancora leggibile dal database; il
   * `DEL` va poi eseguito dopo il commit di quella scrittura.
   */
  async computeSubtreeLocationsBeforeWrite(pageId: number): Promise<CacheableLocation[]> {
    try {
      return await this.collectSubtreeLocations(pageId);
    } catch (err) {
      this.logger.error(
        `Impossibile calcolare il sottoalbero di cache per pageId=${pageId}, invalidazione saltata: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /** Cancella le chiavi calcolate da {@link computeSubtreeLocationsBeforeWrite}, da chiamare dopo il commit. */
  async invalidateLocations(locations: CacheableLocation[], actingUserId: number): Promise<void> {
    if (locations.length === 0) return;
    const withAliases = locations.flatMap((loc) => this.expandHomeAliases(loc));
    await this.invalidateKeys(withAliases, actingUserId);
  }

  // ─── Calcolo dei percorsi dal database (mai `SCAN`, ADR-23 § 5) ──────────

  /** La home (`parentId` nullo, slug `home`) è raggiungibile anche da `/` (ADR-24 § 7): stessa riga, due chiavi. */
  private expandHomeAliases(location: CacheableLocation): CacheableLocation[] {
    const segments = location.path.split('/').filter((s) => s.length > 0);
    if (segments.length === 1 && segments[0] === HOME_SLUG) {
      return [location, { locale: location.locale, path: '/' }];
    }
    return [location];
  }

  /**
   * Risolve `locale`+`path` canonici di una Pagina (stesso calcolo di
   * {@link invalidatePage}, esposto qui perché `ExportModule` (RFC-44) ne ha
   * bisogno per accodare l'export/tombstone con lo stesso percorso che
   * questa cache invalida — mai un secondo calcolo divergente).
   */
  async resolveLocation(pageId: number): Promise<CacheableLocation | null> {
    return this.resolveOwnLocation(pageId);
  }

  private async resolveOwnLocation(pageId: number): Promise<CacheableLocation | null> {
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

  /** Slug degli antenati, dalla radice al genitore diretto; `null` se la catena è interrotta (riga mancante). */
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
   * Percorso della Pagina e di ogni discendente, per livelli (BFS): ogni
   * nodo eredita i segmenti già accumulati dal padre invece di rifare la
   * salita per ogni riga — una sola interrogazione dei figli per nodo.
   */
  private async collectSubtreeLocations(rootId: number): Promise<CacheableLocation[]> {
    const root = await this.db.db.query.pageEntity.findFirst({
      where: eq(pageEntity.id, rootId),
      columns: { id: true, slug: true, parentId: true, locale: true },
    });
    if (!root) return [];

    const ancestorSlugs = await this.loadAncestorSlugs(root.parentId);
    if (ancestorSlugs === null) return [];

    const locations: CacheableLocation[] = [];
    let frontier: { id: number; slug: string; ancestorSlugs: string[] }[] = [
      { id: root.id, slug: root.slug, ancestorSlugs },
    ];

    while (frontier.length > 0) {
      const nextFrontier: typeof frontier = [];
      for (const node of frontier) {
        const segments = [...node.ancestorSlugs, node.slug];
        locations.push({
          locale: root.locale,
          path: canonicalizePublicPath('/' + segments.join('/')),
        });

        const children = await this.db.db.query.pageEntity.findMany({
          where: eq(pageEntity.parentId, node.id),
          columns: { id: true, slug: true },
        });
        for (const child of children) {
          nextFrontier.push({ id: child.id, slug: child.slug, ancestorSlugs: segments });
        }
      }
      frontier = nextFrontier;
    }

    return locations;
  }

  // ─── Cancellazione (ADR-23 § 6) ───────────────────────────────────────────

  /**
   * `DEL` sincrono come percorso primario. Due esiti distinti sul
   * fallimento: Redis irraggiungibile → si logga e si prosegue (la coda
   * vive sullo stesso Redis, accodare non avrebbe senso); Redis raggiungibile
   * ma il comando fallisce → job BullMQ di retry con backoff più audit con
   * l'elenco delle chiavi. Non lancia mai: un guasto di cache non deve mai
   * risalire come errore HTTP al chiamante (ADR-23 § 6).
   */
  private async invalidateKeys(
    locations: CacheableLocation[],
    actingUserId: number,
  ): Promise<void> {
    const keys = [...new Set(locations.map((loc) => this.buildKey(loc.locale, loc.path)))];
    if (keys.length === 0) return;

    if (!this.redis.isReady()) {
      this.logger.error(
        `Redis irraggiungibile: invalidazione cache pubblica non eseguita per ${keys.length} chiave/i: ${keys.join(', ')}`,
      );
      return;
    }

    try {
      await this.redis.delMany(keys);
    } catch (err) {
      this.logger.error(
        `DEL cache pubblica fallito per ${keys.length} chiave/i, accodo retry: ${(err as Error).message}`,
      );
      await this.auditLogService.log(
        actingUserId,
        'public-page-cache.del-failed',
        'public_page_cache',
        undefined,
        {
          keys,
        },
      );
      try {
        await this.cacheInvalidationQueue.enqueueInvalidation(keys);
      } catch (queueErr) {
        this.logger.error(
          `Accodamento del retry di invalidazione fallito (stesso Redis): ${(queueErr as Error).message}. Chiavi: ${keys.join(', ')}`,
        );
      }
    }
  }
}

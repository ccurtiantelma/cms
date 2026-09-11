import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { pageEntity, pageRevisionEntity } from '../../db/schema';
import { AppConstants } from '../../common/app-constants';
import { AuditLogService } from '../../common/audit-log.service';
import { SettingsService } from '../../settings/settings.service';

/**
 * Worker BullMQ della potatura delle Revisioni (**ADR-61**,
 * `business-rules.md` § Revisioni e cronologia regole 6-9).
 *
 * È l'**unico** percorso del sistema che rimuove una riga di `page_revisions`,
 * e non è raggiungibile da un utente: nessun endpoint, nessun parametro,
 * nessuna UI. Il `DELETE` fisico vietato dalla Constitution è la cancellazione
 * come operazione di dominio esposta a un attore; qui la policy dichiara
 * scadute le righe e un processo di sistema le applica.
 *
 * Invarianti che questo worker non viola mai:
 * - `retentionCount = 0` → non tocca nulla (default di fabbrica, ADR-61 § 3);
 * - la Revisione pubblicata (`pages.publishedRevisionId`) e la più recente
 *   della Pagina non sono mai potabili, nemmeno con soglia più bassa del
 *   numero di righe protette (ADR-61 § 4);
 * - nessuna `UPDATE` su `page_revisions`: una Revisione non si modifica, e un
 *   soft delete su una tabella append-only sarebbe la violazione più insidiosa
 *   (quella formalmente compatibile col divieto);
 * - ogni esecuzione lascia una traccia aggregata in audit log, mai il contenuto
 *   degli snapshot rimossi (ADR-61 § 5, dati personali fuori dai log).
 */
/**
 * Insieme delle Revisioni che la potatura non può toccare per una Pagina
 * (ADR-61 § 4): le `retentionCount` più recenti, più la pubblicata, più
 * l'ultima in assoluto. Funzione pura e separata dal worker proprio perché è
 * l'invariante di sicurezza dell'intera ADR: deve essere verificabile senza
 * montare BullMQ, il DB o il resto.
 *
 * Se la soglia è più bassa del numero di righe protette, l'insieme resta più
 * grande della soglia: vince la protezione, non la soglia.
 *
 * @param recentIds Id delle Revisioni più recenti, già limitate a `retentionCount`.
 * @param publishedRevisionId Revisione attualmente online, o `null` se la Pagina non è pubblicata.
 * @param latestId Revisione più recente in assoluto, o `null` se la Pagina non ne ha.
 */
export function computeProtectedRevisionIds(
  recentIds: number[],
  publishedRevisionId: number | null,
  latestId: number | null,
): Set<number> {
  const protectedIds = new Set<number>(recentIds);
  if (publishedRevisionId !== null) {
    protectedIds.add(publishedRevisionId);
  }
  if (latestId !== null) {
    protectedIds.add(latestId);
  }
  return protectedIds;
}

@Injectable()
@Processor('revisions-retention-queue')
export class RevisionsRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RevisionsRetentionProcessor.name);

  /** Inietta DB, lettura della policy e audit log. */
  constructor(
    private readonly db: DbService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {
    super();
  }

  /**
   * Applica la retention corrente a un lotto di Pagine per esecuzione.
   * @param job Job BullMQ ricorrente; il payload è vuoto, la policy si rilegge
   * a ogni giro perché un Admin può averla cambiata fra due esecuzioni.
   */
  async process(job: Job): Promise<void> {
    const { retentionCount } = await this.settingsService.getRevisionsRetention();
    if (retentionCount <= 0) {
      this.logger.log('Potatura Revisioni disattivata (retentionCount=0): nessuna riga toccata.');
      return;
    }

    const pages = await this.db.db.query.pageEntity.findMany({
      columns: { id: true, guid: true, publishedRevisionId: true },
      limit: AppConstants.revisionsRetentionPageBatchSize,
      orderBy: pageEntity.id,
    });

    let prunedTotal = 0;
    let touchedPages = 0;

    for (const page of pages) {
      const pruned = await this.prunePage(page, retentionCount);
      if (pruned > 0) {
        prunedTotal += pruned;
        touchedPages++;
      }
    }

    this.logger.log(
      `Potatura Revisioni completata: ${prunedTotal} rimosse su ${touchedPages} Pagine (soglia=${retentionCount}, lotto=${pages.length}).`,
    );

    if (prunedTotal > 0) {
      await this.auditLogService.log(
        null,
        'revisions.retention.prune',
        'page_revisions',
        String(job.id ?? 'repeatable'),
        `Rimosse ${prunedTotal} Revisioni su ${touchedPages} Pagine (soglia=${retentionCount}).`,
      );
    }
  }

  /**
   * Pota una singola Pagina e ritorna quante Revisioni ha rimosso.
   *
   * Le righe da conservare si scelgono **leggendo**, non calcolando: si prendono
   * le `retentionCount` più recenti, vi si aggiungono le due protette, e si
   * rimuove solo ciò che resta fuori da quell'insieme. Un `DELETE` costruito al
   * contrario (per `revisionNumber < soglia`) sarebbe più corto e sbaglierebbe
   * ogni volta che i progressivi hanno buchi.
   */
  private async prunePage(
    page: { id: number; guid: string; publishedRevisionId: number | null },
    retentionCount: number,
  ): Promise<number> {
    const keep = await this.db.db.query.pageRevisionEntity.findMany({
      columns: { id: true },
      where: eq(pageRevisionEntity.pageId, page.id),
      orderBy: desc(pageRevisionEntity.revisionNumber),
      limit: retentionCount,
    });

    // La più recente in assoluto è già dentro `keep` quando `retentionCount >= 1`,
    // ma si rilegge esplicitamente: è un'invariante di ADR-61, non un effetto
    // collaterale del `limit`, e deve restare vera anche se il `limit` cambia.
    const [latest] = await this.db.db.query.pageRevisionEntity.findMany({
      columns: { id: true },
      where: eq(pageRevisionEntity.pageId, page.id),
      orderBy: desc(pageRevisionEntity.revisionNumber),
      limit: 1,
    });

    const protectedIds = computeProtectedRevisionIds(
      keep.map((row) => row.id),
      page.publishedRevisionId,
      latest?.id ?? null,
    );

    if (protectedIds.size === 0) {
      return 0;
    }

    const removed = await this.db.db
      .delete(pageRevisionEntity)
      .where(
        and(
          eq(pageRevisionEntity.pageId, page.id),
          notInArray(pageRevisionEntity.id, [...protectedIds]),
        ),
      )
      .returning({ id: pageRevisionEntity.id });

    if (removed.length > 0) {
      this.logger.log(
        `Pagina ${page.guid}: rimosse ${removed.length} Revisioni eccedenti (conservate ${protectedIds.size}).`,
      );
    }
    return removed.length;
  }
}

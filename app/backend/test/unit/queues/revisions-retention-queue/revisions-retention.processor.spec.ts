import type { Job } from 'bullmq';
import {
  computeProtectedRevisionIds,
  RevisionsRetentionProcessor,
} from '../../../../src/queues/revisions-retention-queue/revisions-retention.processor';
import { DbService } from '../../../../src/db/db.service';
import { AuditLogService } from '../../../../src/common/audit-log.service';
import { SettingsService } from '../../../../src/settings/settings.service';

/**
 * Copertura della potatura delle Revisioni (ADR-61). Le invarianti verificate
 * qui non sono dettagli d'implementazione: sono le regole 5-9 di
 * `business-rules.md` § Revisioni e cronologia, e la distinzione fra "processo
 * di sistema" e `DELETE` fisico vietato regge solo se restano vere.
 */
describe('RevisionsRetentionProcessor (unit)', () => {
  let pagesFindManyMock: jest.Mock;
  let revisionsFindManyMock: jest.Mock;
  let deleteWhereMock: jest.Mock;
  let deleteReturningMock: jest.Mock;
  let updateMock: jest.Mock;
  let getRetentionMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let processor: RevisionsRetentionProcessor;

  const job = { id: 'repeatable:1' } as unknown as Job;

  /** Riga di `pages` ridotta alle colonne che il processor legge davvero. */
  const buildPage = (id: number, publishedRevisionId: number | null) => ({
    id,
    guid: `guid-${id}`.padEnd(16, '0'),
    publishedRevisionId,
  });

  beforeEach(() => {
    pagesFindManyMock = jest.fn().mockResolvedValue([]);
    revisionsFindManyMock = jest.fn().mockResolvedValue([]);
    deleteReturningMock = jest.fn().mockResolvedValue([]);
    deleteWhereMock = jest.fn().mockReturnValue({ returning: deleteReturningMock });
    updateMock = jest.fn();
    getRetentionMock = jest.fn().mockResolvedValue({ retentionCount: 2 });
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    const dbService = {
      db: {
        query: {
          pageEntity: { findMany: pagesFindManyMock },
          pageRevisionEntity: { findMany: revisionsFindManyMock },
        },
        delete: jest.fn().mockReturnValue({ where: deleteWhereMock }),
        update: updateMock,
      },
    } as unknown as DbService;

    processor = new RevisionsRetentionProcessor(
      dbService,
      { getRevisionsRetention: getRetentionMock } as unknown as SettingsService,
      { log: auditLogMock } as unknown as AuditLogService,
    );
  });

  it('non tocca nulla quando la retention è disattivata (retentionCount = 0)', async () => {
    getRetentionMock.mockResolvedValue({ retentionCount: 0 });

    await processor.process(job);

    expect(pagesFindManyMock).not.toHaveBeenCalled();
    expect(deleteWhereMock).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('rilegge la policy a ogni esecuzione: un Admin può averla cambiata fra due giri', async () => {
    await processor.process(job);
    await processor.process(job);

    expect(getRetentionMock).toHaveBeenCalledTimes(2);
  });

  it('non esegue mai una UPDATE su page_revisions: la tabella è append-only', async () => {
    pagesFindManyMock.mockResolvedValue([buildPage(1, 10)]);
    revisionsFindManyMock.mockResolvedValue([{ id: 12 }, { id: 11 }]);
    deleteReturningMock.mockResolvedValue([{ id: 7 }]);

    await processor.process(job);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rilegge la Revisione più recente anche quando è già fra le conservate', async () => {
    pagesFindManyMock.mockResolvedValue([buildPage(1, 3)]);
    revisionsFindManyMock
      .mockResolvedValueOnce([{ id: 12 }, { id: 11 }])
      .mockResolvedValueOnce([{ id: 12 }]);

    await processor.process(job);

    // Due letture: le più recenti entro la soglia, e l'ultima in assoluto.
    // L'invariante non dipende dal valore del `limit`.
    expect(revisionsFindManyMock).toHaveBeenCalledTimes(2);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it('non elimina nulla per una Pagina senza Revisioni', async () => {
    pagesFindManyMock.mockResolvedValue([buildPage(1, null)]);
    revisionsFindManyMock.mockResolvedValue([]);

    await processor.process(job);

    expect(deleteWhereMock).not.toHaveBeenCalled();
  });

  it('scrive un audit log aggregato solo se ha rimosso qualcosa, senza il contenuto degli snapshot', async () => {
    pagesFindManyMock.mockResolvedValue([buildPage(1, 10)]);
    revisionsFindManyMock.mockResolvedValue([{ id: 12 }, { id: 11 }]);
    deleteReturningMock.mockResolvedValue([{ id: 7 }, { id: 6 }]);

    await processor.process(job);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const [userId, action, entity, , details] = auditLogMock.mock.calls[0];
    expect(userId).toBeNull();
    expect(action).toBe('revisions.retention.prune');
    expect(entity).toBe('page_revisions');
    expect(details).toContain('2');
    expect(details).not.toContain('draftContent');
  });

  it('non scrive audit log se la potatura non ha rimosso nulla', async () => {
    pagesFindManyMock.mockResolvedValue([buildPage(1, 10)]);
    revisionsFindManyMock.mockResolvedValue([{ id: 12 }, { id: 11 }]);
    deleteReturningMock.mockResolvedValue([]);

    await processor.process(job);

    expect(auditLogMock).not.toHaveBeenCalled();
  });
});

/**
 * L'invariante di sicurezza di ADR-61 § 4, verificata sulla funzione pura: è
 * qui che si decide cosa la potatura non può toccare, e va leggibile senza
 * montare BullMQ o il DB.
 */
describe('computeProtectedRevisionIds (unit)', () => {
  it('protegge le più recenti entro la soglia', () => {
    expect([...computeProtectedRevisionIds([12, 11], null, 12)]).toEqual([12, 11]);
  });

  it('protegge la Revisione pubblicata anche quando è molto più vecchia della soglia', () => {
    const protectedIds = computeProtectedRevisionIds([12, 11], 3, 12);

    expect(protectedIds.has(3)).toBe(true);
    expect(protectedIds.size).toBe(3);
  });

  it("protegge l'ultima in assoluto anche se la soglia è 0 righe recenti", () => {
    const protectedIds = computeProtectedRevisionIds([], null, 12);

    expect(protectedIds.has(12)).toBe(true);
  });

  it('con soglia più bassa del numero di righe protette vince la protezione, non la soglia', () => {
    // Soglia 1 → una sola "recente", ma pubblicata e ultima sono righe diverse:
    // l'insieme protetto resta di 2, più grande della soglia.
    const protectedIds = computeProtectedRevisionIds([12], 3, 12);

    expect(protectedIds.size).toBe(2);
    expect([...protectedIds].sort((a, b) => a - b)).toEqual([3, 12]);
  });

  it('non inventa protezioni: una Pagina senza Revisioni e senza pubblicata non protegge nulla', () => {
    expect(computeProtectedRevisionIds([], null, null).size).toBe(0);
  });

  it('non duplica quando pubblicata e ultima coincidono', () => {
    expect(computeProtectedRevisionIds([12], 12, 12).size).toBe(1);
  });
});

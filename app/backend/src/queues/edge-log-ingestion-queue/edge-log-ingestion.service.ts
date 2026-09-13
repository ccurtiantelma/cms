import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConstants } from '../../common/app-constants';
import { DbService } from '../../db/db.service';
import { analyticsEventEntity } from '../../db/schema';
import { RedisService } from '../../redis/redis.service';
import { parseEdgeLogLine, toPageview } from '../../analytics/edge-log-line.util';
import { parseUserAgent } from '../../analytics/user-agent-parser.util';
import { computeVisitorHash } from '../../analytics/visitor-hash.util';

/** Nome dei file scritti da `nginx-static`: uno per giorno UTC (`access-2026-09-13.log`). */
const LOG_FILE_PATTERN = /^access-(\d{4}-\d{2}-\d{2}|undated)\.log$/;
/** Blocco letto per volta: un file grande non entra mai tutto in memoria. */
const READ_CHUNK_BYTES = 1024 * 1024;
const INSERT_BATCH_SIZE = 500;
const OFFSET_KEY_PREFIX = 'analytics:edge-log-offset:';

type AnalyticsEventRow = typeof analyticsEventEntity.$inferInsert;

/** Esito di un giro di ingestione, per il log del processor e per i test. */
export interface EdgeLogIngestionResult {
  filesRead: number;
  filesDeleted: number;
  linesRead: number;
  eventsInserted: number;
}

/**
 * Trasforma i log delle visite di `nginx-static` in `analytics_events`
 * (ADR-68). Legge ogni file dall'ultima posizione salvata, tiene solo le visite
 * di persone a Pagine, sostituisce l'IP con l'hash giornaliero e cancella i
 * file dei giorni conclusi: l'IP grezzo non sopravvive al giorno successivo.
 *
 * Idempotente: il `guid` di ogni evento deriva da file e posizione della riga,
 * quindi rileggere una riga (posizione persa, job ripetuto) non duplica nulla.
 */
@Injectable()
export class EdgeLogIngestionService {
  private readonly logger = new Logger(EdgeLogIngestionService.name);

  /** Inietta database e Redis, dove vive la posizione di lettura di ogni file. */
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  /** Legge i file di log presenti; `now` decide quali giorni sono conclusi. */
  async ingest(now: Date = new Date()): Promise<EdgeLogIngestionResult> {
    const result: EdgeLogIngestionResult = {
      filesRead: 0,
      filesDeleted: 0,
      linesRead: 0,
      eventsInserted: 0,
    };
    const dir = AppConstants.edgeAccessLogDir;
    if (!existsSync(dir)) {
      return result;
    }

    const today = now.toISOString().slice(0, 10);
    const files = (await readdir(dir)).filter((name) => LOG_FILE_PATTERN.test(name)).sort();

    for (const name of files) {
      const day = LOG_FILE_PATTERN.exec(name)?.[1] ?? 'undated';
      const offsetKey = `${OFFSET_KEY_PREFIX}${name}`;
      const startOffset = Number(await this.redis.get(offsetKey)) || 0;

      const { rows, linesRead, nextOffset } = await this.readFile(
        join(dir, name),
        name,
        startOffset,
      );
      result.filesRead += 1;
      result.linesRead += linesRead;
      result.eventsInserted += await this.insertRows(rows);

      if (day === today) {
        await this.redis.set(offsetKey, String(nextOffset));
      } else {
        // Giorno concluso: nginx non scrive più su questo file.
        await unlink(join(dir, name));
        await this.redis.del(offsetKey);
        result.filesDeleted += 1;
      }
    }

    if (result.linesRead > 0) {
      this.logger.log(
        `Log delle visite: ${result.linesRead} righe lette, ${result.eventsInserted} visite registrate, ${result.filesDeleted} file chiusi e cancellati.`,
      );
    }
    return result;
  }

  /** Righe complete da `startOffset` alla fine del file; una riga ancora in scrittura resta per il giro dopo. */
  private async readFile(
    filePath: string,
    fileName: string,
    startOffset: number,
  ): Promise<{ rows: AnalyticsEventRow[]; linesRead: number; nextOffset: number }> {
    const handle = await open(filePath, 'r');
    const rows: AnalyticsEventRow[] = [];
    let linesRead = 0;
    let offset = startOffset;
    let pending = Buffer.alloc(0);
    let pendingStart = startOffset;

    try {
      const { size } = await handle.stat();
      // File troncato o ricreato: si riparte dall'inizio, il guid evita i doppioni.
      if (offset > size) {
        offset = 0;
        pendingStart = 0;
      }

      while (offset < size) {
        const length = Math.min(READ_CHUNK_BYTES, size - offset);
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
        pending = Buffer.concat([pending, chunk.subarray(0, bytesRead)]);

        let newline = pending.indexOf(0x0a);
        while (newline !== -1) {
          const line = pending.subarray(0, newline).toString('utf8');
          const row = this.toRow(line, fileName, pendingStart);
          if (row) rows.push(row);
          linesRead += 1;
          pendingStart += newline + 1;
          pending = pending.subarray(newline + 1);
          newline = pending.indexOf(0x0a);
        }
      }
    } finally {
      await handle.close();
    }

    return { rows, linesRead, nextOffset: pendingStart };
  }

  private toRow(line: string, fileName: string, lineOffset: number): AnalyticsEventRow | null {
    const entry = parseEdgeLogLine(line);
    const pageview = entry ? toPageview(entry) : null;
    if (!pageview) return null;

    const { device, browser, os } = parseUserAgent(pageview.userAgent);
    return {
      guid: createHash('sha256').update(`${fileName}:${lineOffset}`).digest('hex').slice(0, 16),
      path: pageview.path.slice(0, 500),
      visitorHash: computeVisitorHash(pageview.ip, pageview.userAgent, pageview.visitedAt),
      device,
      browser,
      os,
      referrer: pageview.referrer?.slice(0, 500),
      createdAt: pageview.visitedAt,
    };
  }

  /** Inserisce a blocchi ignorando i `guid` già presenti; restituisce le righe davvero nuove. */
  private async insertRows(rows: AnalyticsEventRow[]): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
      const written = await this.db.db
        .insert(analyticsEventEntity)
        .values(batch)
        .onConflictDoNothing({ target: analyticsEventEntity.guid })
        .returning({ id: analyticsEventEntity.id });
      inserted += written.length;
    }
    return inserted;
  }
}

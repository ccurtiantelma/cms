import { getTableName, Table } from 'drizzle-orm';
import type { DbService } from '../../../src/db/db.service';

/** Operazione registrata dal mock: tipo, tabella e argomenti di `values`/`set`. */
export interface RecordedOp {
  op: 'select' | 'insert' | 'update' | 'delete';
  table?: string;
  values?: unknown;
  set?: unknown;
  /** Metodi concatenati sul builder, nell'ordine (es. `onConflictDoNothing`). */
  calls: string[];
}

/**
 * Mock minimale del client Drizzle per gli unit test RBAC. Ogni builder è
 * thenable come quelli reali: all'`await` consuma il prossimo risultato di
 * `results` (FIFO, nell'ordine in cui il codice attende le query). Un `Error`
 * in coda fa rigettare quella query; coda vuota → `[]`. `transaction(cb)`
 * esegue `cb` con lo stesso client e propaga l'errore come un rollback.
 * `ops` registra ogni builder creato, anche quelli usati come subquery o come
 * ramo di `union` (che non vengono attesi da soli).
 */
export function createDrizzleMock(): {
  dbService: DbService;
  db: Record<string, jest.Mock>;
  results: unknown[];
  ops: RecordedOp[];
} {
  const results: unknown[] = [];
  const ops: RecordedOp[] = [];

  const chainable = [
    'where',
    'innerJoin',
    'leftJoin',
    'orderBy',
    'limit',
    'offset',
    'union',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'returning',
  ];

  function builder(rec: RecordedOp): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const method of chainable) {
      chain[method] = jest.fn(() => {
        rec.calls.push(method);
        return chain;
      });
    }
    chain.from = jest.fn((table: Table) => {
      rec.table = getTableName(table);
      return chain;
    });
    chain.values = jest.fn((values: unknown) => {
      rec.values = values;
      return chain;
    });
    chain.set = jest.fn((set: unknown) => {
      rec.set = set;
      return chain;
    });
    chain.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const next = results.length > 0 ? results.shift() : [];
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      return promise.then(onFulfilled, onRejected);
    };
    return chain;
  }

  function start(op: RecordedOp['op'], table?: Table): Record<string, unknown> {
    const rec: RecordedOp = { op, calls: [], ...(table && { table: getTableName(table) }) };
    ops.push(rec);
    return builder(rec);
  }

  const db: Record<string, jest.Mock> = {
    select: jest.fn(() => start('select')),
    insert: jest.fn((table: Table) => start('insert', table)),
    update: jest.fn((table: Table) => start('update', table)),
    delete: jest.fn((table: Table) => start('delete', table)),
    transaction: jest.fn(),
  };
  db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));

  return { dbService: { db } as unknown as DbService, db, results, ops };
}

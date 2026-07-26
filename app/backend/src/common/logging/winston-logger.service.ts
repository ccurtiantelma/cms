import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { AppConstants } from '../app-constants';

/** Frammenti (case-insensitive) che, se contenuti nel nome di una chiave, ne mascherano il valore nei log. */
const SENSITIVE_KEY_FRAGMENTS = ['password', 'pwd', 'token', 'secret', 'apikey', 'email', 'phone'];

/** Valore sostitutivo usato al posto dei dati sensibili nei log. */
const REDACTED = '[REDACTED]';

/** Profondità massima di ricorsione: oltre questo livello i sotto-oggetti vengono collassati (protegge da strutture cicliche/enormi). */
const MAX_DEPTH = 3;

/**
 * Redige ricorsivamente i dati sensibili prima che un oggetto venga serializzato nei log.
 * Sostituisce con `[REDACTED]` il valore di ogni chiave il cui nome contiene (case-insensitive)
 * uno tra: password, pwd, token, secret, apiKey, email, phone. Gestisce array e oggetti annidati
 * fino a {@link MAX_DEPTH} livelli; i valori primitivi (stringhe, numeri, ecc.) passano invariati,
 * quindi i messaggi di log testuali non vengono alterati.
 * @param value Valore da redigere (oggetto, array o primitivo).
 * @param depth Livello di ricorsione corrente (uso interno).
 * @returns Copia redatta del valore.
 */
export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_FRAGMENTS.some((fragment) => key.toLowerCase().includes(fragment))
      ? REDACTED
      : sanitizeLogData(val, depth + 1);
  }
  return out;
}

/**
 * Logger globale dell'applicazione. Sostituisce il logger interno di NestJS via
 * `app.useLogger()` in main.ts: i `new Logger(NomeService.name)` già presenti in
 * tutto il codice continuano a funzionare invariati, instradati su questi transport.
 *
 * Oltre a Console + rotazione file giornaliera (cima), applica due protezioni
 * riprese dal pattern OpenBridge:
 * - deduplica righe identiche consecutive entro una finestra breve (evita flood da retry/polling)
 * - rate-limit duro a `AppConstants.logMaxPerSec` messaggi/secondo
 */
export class WinstonLoggerService implements LoggerService {
  private readonly logger = winston.createLogger({
    level: AppConstants.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context, trace }) => {
            const ctx = context ? ` [${context}]` : '';
            const traceLine = trace ? `\n${trace}` : '';
            return `${timestamp} ${level}${ctx} ${message}${traceLine}`;
          }),
        ),
      }),
      new DailyRotateFile({
        dirname: AppConstants.logDir,
        filename: 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
      }),
      new DailyRotateFile({
        dirname: AppConstants.logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '30d',
        zippedArchive: true,
      }),
    ],
  });

  // --- Deduplica righe consecutive identiche ---
  private lastLine = '';
  private lastLineTime = 0;
  private dupCount = 0;
  private readonly DEDUP_WINDOW_MS = 2000;

  // --- Rate limit (token bucket per-secondo) ---
  private msgCount = 0;
  private rateWindowStart = Date.now();

  /** Restituisce `true` se il budget di messaggi/secondo è esaurito (il messaggio va scartato). */
  private isRateLimited(): boolean {
    const now = Date.now();
    if (now - this.rateWindowStart > 1000) {
      this.msgCount = 0;
      this.rateWindowStart = now;
    }
    return ++this.msgCount > AppConstants.logMaxPerSec;
  }

  /**
   * Restituisce `true` se `line` è identica alla precedente entro {@link DEDUP_WINDOW_MS}.
   * Alla fine di una serie di duplicati emette una singola riga di riepilogo col conteggio.
   */
  private isDuplicate(line: string): boolean {
    const now = Date.now();

    if (line === this.lastLine && now - this.lastLineTime < this.DEDUP_WINDOW_MS) {
      this.dupCount++;
      return true;
    }

    if (this.dupCount > 0) {
      this.logger.log('info', `[DEDUP] messaggio precedente ripetuto ×${this.dupCount}`);
      this.dupCount = 0;
    }

    this.lastLine = line;
    this.lastLineTime = now;
    return false;
  }

  /** Estrae il context (penultimo/ultimo argomento stringa, convenzione NestJS) e un'eventuale traccia. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma imposta dall'interfaccia LoggerService di NestJS
  private write(level: string, message: any, optionalParams: any[]): void {
    const params = [...optionalParams];
    const context =
      params.length && typeof params[params.length - 1] === 'string' ? params.pop() : undefined;
    const trace = params.length ? params.join(' ') : undefined;
    // I messaggi stringa passano invariati; gli oggetti vengono redatti (password/token/…)
    // prima della serializzazione, così i dati sensibili non finiscono nei log.
    const text = typeof message === 'string' ? message : JSON.stringify(sanitizeLogData(message));

    const line = `${level}${context ? ` [${context}]` : ''} ${text}`;
    if (this.isDuplicate(line) || this.isRateLimited()) return;

    this.logger.log(level, text, { context, trace });
  }

  // `any` in questi 5 metodi ricalca esattamente la firma dell'interfaccia
  // `LoggerService` di @nestjs/common (che questa classe implementa e con cui
  // `app.useLogger()` sostituisce il logger interno di Nest) — non è evitabile
  // senza divergere dal contratto che Nest si aspetta.

  /** Log a livello `info`, con redazione dati sensibili, dedup e rate-limit. */
  log(message: any, ...optionalParams: any[]): void {
    this.write('info', message, optionalParams);
  }

  /** Log a livello `error` (5xx, stack incluso nel log ma mai in risposta HTTP). */
  error(message: any, ...optionalParams: any[]): void {
    this.write('error', message, optionalParams);
  }

  /** Log a livello `warn` (es. 4xx, accessi non autorizzati). */
  warn(message: any, ...optionalParams: any[]): void {
    this.write('warn', message, optionalParams);
  }

  /** Log a livello `debug`. */
  debug(message: any, ...optionalParams: any[]): void {
    this.write('debug', message, optionalParams);
  }

  /** Log a livello `verbose`. */
  verbose(message: any, ...optionalParams: any[]): void {
    this.write('verbose', message, optionalParams);
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { AppConstants } from '../common/app-constants';

/**
 * Client Redis (ioredis) usato come unico session store dell'applicazione:
 * `login:${accessToken}` (allowlist di sessione), `rtk:${refreshToken}`
 * (refresh token opaco), `mfa_tmp:${tmpToken}` (sfida MFA post-login),
 * `session:${sessionId}` (metadati dispositivo/sessione persistenti tra le
 * rotazioni di token) e `user-sessions:${userId}` (set degli id sessione
 * attivi per utente, usato da `GET/DELETE auth/sessions`).
 * Un solo client Redis nel progetto, condiviso anche dalla coda email BullMQ.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: IORedis;

  /** Apre la connessione al server Redis configurato in `AppConstants.redisUrl`. */
  async onModuleInit(): Promise<void> {
    this.client = new IORedis(AppConstants.redisUrl, { maxRetriesPerRequest: null });

    this.client.on('error', (err: unknown) => {
      this.logger.error('Redis Client Error', err);
    });
    this.client.on('connect', () => {
      this.logger.log('Redis connesso correttamente.');
    });
  }

  /** Chiude la connessione Redis allo spegnimento dell'applicazione. */
  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
    this.logger.log('Redis disconnesso.');
  }

  /**
   * Scrive una chiave. Gli oggetti vengono serializzati in JSON automaticamente.
   * @param duration TTL in secondi, opzionale (nessuna scadenza se omesso).
   */
  async set(key: string, value: string | object, duration?: number): Promise<void> {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    if (duration) {
      await this.client.set(key, stringValue, 'EX', duration);
    } else {
      await this.client.set(key, stringValue);
    }
  }

  /** Legge il valore grezzo (stringa) di una chiave, o `null` se assente. */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Legge e deserializza una chiave JSON.
   * @returns Il valore tipizzato, o `null` se la chiave non esiste.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /** Elimina una chiave, restituendo il numero di chiavi rimosse (0 o 1). */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Elimina più chiavi in un solo comando `DEL`, restituendo il numero di
   * chiavi rimosse. Unico metodo aggiunto per l'invalidazione della cache
   * pubblica (ADR-23 § 5): l'insieme delle chiavi si calcola sempre dal
   * database (mai `SCAN`/`KEYS`), questo metodo si limita a cancellarle.
   * `[]` non genera alcuna chiamata Redis.
   */
  async delMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Stato della connessione ioredis (`'ready'` = connesso e operativo).
   * Distingue "Redis irraggiungibile" da "Redis raggiungibile ma il comando
   * fallisce" (ADR-23 § 6), i due esiti che l'invalidazione della cache
   * pubblica tratta diversamente.
   */
  isReady(): boolean {
    return this.client?.status === 'ready';
  }

  /** Verifica se una chiave esiste. */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result > 0;
  }

  /** Aggiunge un membro a un set (usato per l'indice `user-sessions:${userId}`). */
  async sadd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  /** Restituisce tutti i membri di un set, o array vuoto se la chiave non esiste. */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  /** Rimuove un membro da un set. */
  async srem(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  /** Imposta/rinnova la TTL (secondi) di una chiave esistente. */
  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  /** Esegue un PING sul client Redis. Usato dall'health check applicativo (`src/health/`). */
  async ping(): Promise<string> {
    return this.client.ping();
  }
}

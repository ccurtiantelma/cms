import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as client from 'prom-client';

/**
 * Registro Prometheus dedicato (ADR-15): non usa il registro globale di
 * `prom-client` per evitare doppie registrazioni delle stesse metriche se il
 * modulo venisse per errore importato più di una volta (es. test).
 */
@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry = new client.Registry();

  private readonly httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Durata delle richieste HTTP in secondi',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5],
    registers: [this.registry],
  });

  /** Avvia la raccolta delle metriche di processo standard (CPU, memoria, event loop lag). */
  constructor() {
    client.collectDefaultMetrics({ register: this.registry });
  }

  /** Content-Type standard Prometheus (`text/plain; version=0.0.4`) da impostare in risposta. */
  get contentType(): string {
    return this.registry.contentType;
  }

  /** Registra la durata di una richiesta HTTP nell'istogramma `http_request_duration_seconds`. */
  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    this.httpRequestDurationSeconds.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds,
    );
  }

  /** Serializza tutte le metriche registrate nel formato testuale Prometheus. */
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Libera le risorse del registro allo shutdown del modulo (timer interni di `collectDefaultMetrics`). */
  onModuleDestroy(): void {
    this.registry.clear();
  }
}

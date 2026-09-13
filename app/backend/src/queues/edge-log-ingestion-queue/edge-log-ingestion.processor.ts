import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EdgeLogIngestionService } from './edge-log-ingestion.service';

/** Worker del job repeatable che legge i log delle visite di `nginx-static` (ADR-68). */
@Injectable()
@Processor('edge-log-ingestion-queue')
export class EdgeLogIngestionProcessor extends WorkerHost {
  /** Inietta il servizio che fa il lavoro, testabile senza BullMQ. */
  constructor(private readonly ingestion: EdgeLogIngestionService) {
    super();
  }

  /** Un giro di lettura dei file di log presenti. */
  async process(): Promise<void> {
    await this.ingestion.ingest();
  }
}

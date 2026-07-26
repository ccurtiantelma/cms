import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SeedService } from './seed.service';
import { DbModule } from '../db/db.module';
import { EmailQueueModule } from '../queues/email-queue/email-queue.module';

/** Modulo amministrativo: gestione utenti, audit log (Admin+) e dati demo (SuperAdmin only). */
@Module({
  imports: [DbModule, EmailQueueModule],
  controllers: [AdminController],
  providers: [AdminService, SeedService],
})
export class AdminModule {}

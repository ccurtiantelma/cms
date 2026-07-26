import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DbModule } from '../db/db.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Notifiche persistenti per-utente (bell/badge) + push realtime via
 * `AppGateway` quando `RealtimeModule` è montato (ADR-12). `NotificationsService`
 * è esportato: i moduli di dominio del progetto verticale lo iniettano per
 * chiamare `notify()` sui propri eventi applicativi.
 */
@Module({
  imports: [DbModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

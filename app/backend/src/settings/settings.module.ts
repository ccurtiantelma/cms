import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { DbModule } from '../db/db.module';

/** Modulo dei settaggi globali di installazione (`app_settings`, ADR-4). */
@Module({
  imports: [DbModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}

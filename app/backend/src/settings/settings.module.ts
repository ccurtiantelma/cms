import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { DbModule } from '../db/db.module';
import { ExportModule } from '../export/export.module';

/**
 * Modulo dei settaggi globali di installazione (`app_settings`, ADR-4,
 * RFC-F05 § 1). `SettingsService` è esportato: `PagesModule` lo riusa per
 * validare il `locale` di una traduzione contro il registro Locale attivi
 * (RFC-F05 § 3, M3), mai una seconda lettura ad-hoc di `app_settings`.
 * `ExportModule` (RFC-44 Decisione 3) porta `ExportService`: `updateTheme`
 * accoda un full-site rebuild dopo ogni salvataggio del tema. Nessun ciclo:
 * `ExportModule` non dipende da `SettingsModule` (`PagesModule` importa
 * entrambi indipendentemente).
 */
@Module({
  imports: [DbModule, ExportModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

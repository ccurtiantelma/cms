import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { GlobalKitPublicController } from './global-kit-public.controller';
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
 * entrambi indipendentemente). `ExportModule` esporta anche
 * `STATIC_SITE_DEPLOYER` (S1.3): `SettingsService.updateGlobalKit` lo inietta
 * per scrivere `global-kit.<hash>.css` sincronicamente (`SPEC-GLOBAL-KIT.md` §
 * 3 punto 6). `GlobalKitPublicController` (`GET public/global-kit.css`) è
 * anonimo per costruzione (prefisso `public/*path`, escluso da
 * `AuthMiddleware` in `app.module.ts`), registrato qui perché condivide
 * `SettingsService`/il compilatore con `SettingsController`.
 */
@Module({
  imports: [DbModule, ExportModule],
  controllers: [SettingsController, GlobalKitPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

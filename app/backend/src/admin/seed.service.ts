import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { userEntity } from '../db/schema';
import { Utils } from '../common/utils';
import { AppConstants } from '../common/app-constants';
import { AppUserRoles } from '../common/enums';
import { antelmaContactSeed } from './seeds/antelma-contact.seed';
import { antelmaHomePageSeed } from './seeds/antelma-home-page.seed';
import { antelmaChiSiamoPageSeed } from './seeds/antelma-chi-siamo-page.seed';
import { antelmaGlobalSectionsSeed } from './seeds/antelma-global-sections.seed';

/** Password demo fissa per gli utenti Admin/Manager/User creati dal seed (documentata nel log). */
const DEMO_PASSWORD = 'CmsDemo#2026';
/** Credenziali di fallback per SuperAdmin quando `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` non sono valorizzate (solo sviluppo locale). */
const FALLBACK_SUPERADMIN_EMAIL = 'superadmin@cms.local';
const FALLBACK_SUPERADMIN_PASSWORD = 'SuperAdmin#2026';

/**
 * Popolamento dati demo: crea un utente per ciascun ruolo RBAC
 * (SuperAdmin/Admin/Manager/User). Riutilizzabile sia dallo script CLI
 * (`db/seed.ts`, `npm run seed`) sia dall'endpoint `POST /app/admin/system/seed-demo`.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  /** Inietta il servizio di accesso al DB. */
  constructor(private readonly dbService: DbService) {}

  /**
   * Punto di ingresso unico del seed (`npm run seed` via `db/seed.ts`,
   * endpoint `POST /app/admin/system/seed-demo` via `AdminService.seedDemo()`):
   * utenti demo, poi le tre Pagine aziendali interconnesse "v1.0 Demo
   * Showcase" (F17-01: Home/Chi Siamo/Contatti — referenziano l'utente
   * SuperAdmin appena creato/garantito come `createdBy`/`updatedBy` delle
   * proprie righe), infine le Sezioni Globali (l'Header legge il `guid` delle
   * tre Pagine appena seedate per il blocco `navMenu`, ADR-52). L'ordine non
   * è intercambiabile.
   */
  async run(): Promise<Record<string, number>> {
    const usersSummary = await this.seedDemo();
    const homeSummary = await antelmaHomePageSeed(this.dbService);
    const chiSiamoSummary = await antelmaChiSiamoPageSeed(this.dbService);
    const pageSummary = await antelmaContactSeed(this.dbService);
    const globalSectionsSummary = await antelmaGlobalSectionsSeed(this.dbService);
    return {
      ...usersSummary,
      'pages.home.created': homeSummary.created,
      'pages.home.updated': homeSummary.updated,
      'pages.home.unchanged': homeSummary.unchanged,
      'pages.chi-siamo.created': chiSiamoSummary.created,
      'pages.chi-siamo.updated': chiSiamoSummary.updated,
      'pages.chi-siamo.unchanged': chiSiamoSummary.unchanged,
      'pages.contatti-antelma.created': pageSummary.created,
      'pages.contatti-antelma.updated': pageSummary.updated,
      'pages.contatti-antelma.unchanged': pageSummary.unchanged,
      'globalSections.header.created': globalSectionsSummary.header.created,
      'globalSections.header.updated': globalSectionsSummary.header.updated,
      'globalSections.header.unchanged': globalSectionsSummary.header.unchanged,
      'globalSections.footer.created': globalSectionsSummary.footer.created,
      'globalSections.footer.updated': globalSectionsSummary.footer.updated,
      'globalSections.footer.unchanged': globalSectionsSummary.footer.unchanged,
    };
  }

  /**
   * Crea (o aggiorna, se già presenti) gli utenti demo, uno per ruolo.
   * Idempotente: eseguibile più volte senza duplicare record (upsert per email).
   * @returns Summary con il numero di utenti creati (non aggiornati).
   */
  async seedDemo(): Promise<Record<string, number>> {
    const db = this.dbService.db;

    const superAdminEmail = AppConstants.superAdminEmail || FALLBACK_SUPERADMIN_EMAIL;
    const superAdminPassword = AppConstants.superAdminPassword || FALLBACK_SUPERADMIN_PASSWORD;
    if (!AppConstants.superAdminEmail || !AppConstants.superAdminPassword) {
      this.logger.warn(
        `SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD non valorizzate: uso credenziali di fallback (${superAdminEmail} / ${superAdminPassword}). Da non usare in produzione.`,
      );
    }

    const demoUsers = [
      {
        name: 'Super',
        surname: 'Admin',
        email: superAdminEmail,
        password: superAdminPassword,
        role: AppUserRoles.SuperAdmin,
      },
      {
        name: 'Admin',
        surname: 'Demo',
        email: 'admin.demo@cms.local',
        password: DEMO_PASSWORD,
        role: AppUserRoles.Admin,
      },
      {
        name: 'Manager',
        surname: 'Demo',
        email: 'manager.demo@cms.local',
        password: DEMO_PASSWORD,
        role: AppUserRoles.Manager,
      },
      {
        name: 'Utente',
        surname: 'Demo',
        email: 'user.demo@cms.local',
        password: DEMO_PASSWORD,
        role: AppUserRoles.User,
      },
    ];

    const existingEmails = new Set(
      (await db.query.userEntity.findMany({ columns: { email: true } })).map((u) => u.email),
    );

    let created = 0;
    for (const demoUser of demoUsers) {
      const pwd = await Utils.hashPassword(demoUser.password);
      // ON CONFLICT DO UPDATE segnala sempre la riga come "affetta" anche quando il valore
      // non cambia: il conteggio dei "creati" si basa quindi sulla presenza pregressa (Set),
      // non sul rowCount della insert.
      await db
        .insert(userEntity)
        .values({
          name: demoUser.name,
          surname: demoUser.surname,
          email: demoUser.email,
          pwd,
          role: demoUser.role,
          pwdSet: true,
        })
        .onConflictDoUpdate({
          target: userEntity.email,
          set: { pwdSet: true, pwd, isActive: true },
        });
      if (!existingEmails.has(demoUser.email)) created++;
    }

    this.logger.log(
      `Seed demo completato. Credenziali (solo ambienti non di produzione): ` +
        `SuperAdmin=${superAdminEmail}/${superAdminPassword} — Admin/Manager/Utente demo password="${DEMO_PASSWORD}".`,
    );

    return { users: created };
  }
}

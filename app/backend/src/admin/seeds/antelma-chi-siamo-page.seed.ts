import { and, eq, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { pageEntity, pageRevisionEntity, userEntity } from '../../db/schema';
import { AppConstants } from '../../common/app-constants';
import { AppUserRoles } from '../../common/enums';
import { Utils } from '../../common/utils';
import {
  assertPayloadWithinLimit,
  assertValidContentTreeShape,
  BlockNode,
  ContentTree,
} from '../../pages/content-tree';
import { DEFAULT_BLOCK_REGISTRY } from '../../blocks/block-registry';
import { ENVELOPE_VERSION } from '../../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../../blocks/migration/block-migration.types';
import { BlockTreeValidatorService } from '../../blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../blocks/validator/validatable-node.types';
import { BlockPropSanitizerService } from '../../common/sanitizer/block-prop-sanitizer.service';
import { TreeSanitizerService } from '../../common/sanitizer/tree-sanitizer.service';

/** Slug pubblico della pagina, root (`parentId` null), unico per `locale` (F17-01, "v1.0 Demo Showcase"). */
const PAGE_SLUG = 'chi-siamo';
const PAGE_TITLE = 'Chi Siamo & Servizi';

/**
 * Blueprint statico "Chi Siamo & Servizi" (F17-01). Stesso principio di
 * `antelma-home-page.seed.ts`/`antelma-contact.seed.ts`: solo prop
 * dichiarate dal registro di produzione, nessun `kind` inventato. Le tre
 * schede servizio (Connettività/Cloud/Security) sono una `section` a tre
 * colonne (`columns: '3'`) con tre `container` diretti (`heading`+
 * `richText`), stesso pattern delle colonne di footer in
 * `antelma-global-sections.seed.ts`.
 */
function buildAntelmaChiSiamoBlocks(): BlockNode[] {
  const introSection: BlockNode = {
    id: 'chisiamo-intro-section',
    type: 'section',
    v: 1,
    props: {
      contentWidth: 'boxed',
      stylePaddingTop: { default: '64' },
      stylePaddingBottom: { default: '32' },
    },
    children: [
      {
        id: 'chisiamo-intro-heading',
        type: 'heading',
        v: 1,
        props: { level: 'h2', text: 'Chi Siamo', styleTextAlign: 'center' },
        children: [],
      },
      {
        id: 'chisiamo-intro-text',
        type: 'richText',
        v: 1,
        props: {
          html:
            '<p>Antelma è un gruppo attivo da oltre trent’anni nell’IT &amp; TLC enterprise: ' +
            'progettiamo, realizziamo e manuteniamo l’infrastruttura tecnologica delle aziende ' +
            'che non possono permettersi un fermo, dalla connettività alla sicurezza informatica.</p>',
        },
        children: [],
      },
    ],
  };

  const servicesSection: BlockNode = {
    id: 'chisiamo-services-section',
    type: 'section',
    v: 1,
    props: {
      columns: { default: '3' },
      gap: { default: 'lg' },
      contentWidth: 'boxed',
      stylePaddingTop: { default: '32' },
      stylePaddingBottom: { default: '64' },
    },
    children: [
      {
        id: 'chisiamo-service-connettivita',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          {
            id: 'chisiamo-service-connettivita-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h3', text: 'Connettività' },
            children: [],
          },
          {
            id: 'chisiamo-service-connettivita-text',
            type: 'richText',
            v: 1,
            props: {
              html: '<p>Reti dati e voce enterprise, link ridondati e assistenza certificata su ogni sede.</p>',
            },
            children: [],
          },
        ],
      },
      {
        id: 'chisiamo-service-cloud',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          {
            id: 'chisiamo-service-cloud-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h3', text: 'Cloud' },
            children: [],
          },
          {
            id: 'chisiamo-service-cloud-text',
            type: 'richText',
            v: 1,
            props: {
              html: '<p>Infrastrutture cloud scalabili, backup e continuità operativa per ogni carico di lavoro.</p>',
            },
            children: [],
          },
        ],
      },
      {
        id: 'chisiamo-service-security',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          {
            id: 'chisiamo-service-security-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h3', text: 'Security' },
            children: [],
          },
          {
            id: 'chisiamo-service-security-text',
            type: 'richText',
            v: 1,
            props: {
              html: '<p>Protezione perimetrale, monitoraggio continuo e risposta agli incidenti di sicurezza.</p>',
            },
            children: [],
          },
        ],
      },
    ],
  };

  return [introSection, servicesSection];
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Stessa pipeline di scrittura di `PagesService` replicata senza contesto DI
 * di Nest — stesso motivo di `antelma-home-page.seed.ts`.
 */
function buildPersistableContentTree(): ContentTree {
  const rawTree: ContentTree = { version: ENVELOPE_VERSION, blocks: buildAntelmaChiSiamoBlocks() };
  assertValidContentTreeShape(rawTree);

  const migration = migrateBlockTree(
    rawTree.blocks as unknown as MigratableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
  );
  if (migration.errors.length > 0) {
    throw new Error(
      `Seed "${PAGE_SLUG}": migrazione dell'albero blocchi fallita — ${JSON.stringify(migration.errors[0])}`,
    );
  }

  const validator = new BlockTreeValidatorService();
  const validation = validator.validateTree(
    migration.blocks as ValidatableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
    { roleLevel: AppUserRoles.SuperAdmin },
  );
  if (!validation.valid) {
    throw new Error(
      `Seed "${PAGE_SLUG}": albero blocchi non valido — ${JSON.stringify(validation.errors[0])}`,
    );
  }

  const sanitizer = new BlockPropSanitizerService();
  const sanitized = sanitizer.sanitizeTree(
    migration.blocks as ValidatableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
  );
  if (sanitized.errors.length > 0) {
    throw new Error(
      `Seed "${PAGE_SLUG}": sanitizzazione dell'albero blocchi fallita — ${JSON.stringify(sanitized.errors[0])}`,
    );
  }

  const persistable: ContentTree = {
    version: ENVELOPE_VERSION,
    blocks: sanitized.tree as unknown as BlockNode[],
  };
  assertPayloadWithinLimit(persistable, 'persist');
  return persistable;
}

/** Esito idempotente del seed: quale delle tre azioni è stata eseguita. */
export interface AntelmaChiSiamoPageSeedResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Crea o ripubblica la pagina "Chi Siamo & Servizi" (`/chi-siamo`),
 * idempotente per `slug`+`locale` — stessa strategia di `antelmaHomePageSeed`.
 */
export async function antelmaChiSiamoPageSeed(
  dbService: DbService,
): Promise<AntelmaChiSiamoPageSeedResult> {
  const db = dbService.db;
  const locale = AppConstants.defaultLocale;

  const author = await db.query.userEntity.findFirst({
    where: eq(userEntity.role, AppUserRoles.SuperAdmin),
  });
  if (!author) {
    throw new Error(`Seed "${PAGE_SLUG}": nessun utente SuperAdmin trovato — eseguire prima il seed utenti.`);
  }

  const content = buildPersistableContentTree();
  const seoSanitizer = new TreeSanitizerService();
  const seo = seoSanitizer.sanitizeTree({
    metaTitle: PAGE_TITLE,
    metaDescription:
      'Antelma: chi siamo e i nostri servizi enterprise — connettività, cloud e security.',
  });

  const existing = await db.query.pageEntity.findFirst({
    where: and(
      eq(pageEntity.slug, PAGE_SLUG),
      eq(pageEntity.locale, locale),
      isNull(pageEntity.parentId),
      eq(pageEntity.isActive, true),
    ),
  });

  if (!existing) {
    await db.transaction(async (tx) => {
      const [page] = await tx
        .insert(pageEntity)
        .values({
          title: PAGE_TITLE,
          slug: PAGE_SLUG,
          locale,
          parentId: null,
          translationGroupId: Utils.randomString(16),
          draftContent: content,
          draftSeo: seo,
          createdBy: author.id,
          updatedBy: author.id,
        })
        .returning();

      const [revision] = await tx
        .insert(pageRevisionEntity)
        .values({
          pageId: page.id,
          revisionNumber: 1,
          title: PAGE_TITLE,
          slug: PAGE_SLUG,
          content,
          seo,
          createdBy: author.id,
        })
        .returning();

      await tx
        .update(pageEntity)
        .set({ status: 'published', publishedAt: new Date(), publishedRevisionId: revision.id })
        .where(eq(pageEntity.id, page.id));
    });

    return { created: 1, updated: 0, unchanged: 0 };
  }

  const unchanged =
    existing.status === 'published' &&
    existing.title === PAGE_TITLE &&
    canonicalJson(existing.draftContent) === canonicalJson(content) &&
    canonicalJson(existing.draftSeo) === canonicalJson(seo);
  if (unchanged) {
    return { created: 0, updated: 0, unchanged: 1 };
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .update(pageEntity)
      .set({
        title: PAGE_TITLE,
        draftContent: content,
        draftSeo: seo,
        status: 'published',
        publishedAt: new Date(),
        scheduledAt: null,
        version: sql`${pageEntity.version} + 1`,
        updatedAt: new Date(),
        updatedBy: author.id,
      })
      .where(and(eq(pageEntity.id, existing.id), eq(pageEntity.version, existing.version)))
      .returning();

    if (!locked) {
      throw new Error(
        `Seed "${PAGE_SLUG}": conflitto di concorrenza — un altro processo ha modificato la riga durante il seed.`,
      );
    }

    const [{ maxRevisionNumber }] = await tx
      .select({
        maxRevisionNumber: sql<number>`coalesce(max(${pageRevisionEntity.revisionNumber}), 0)`,
      })
      .from(pageRevisionEntity)
      .where(eq(pageRevisionEntity.pageId, locked.id));

    const [revision] = await tx
      .insert(pageRevisionEntity)
      .values({
        pageId: locked.id,
        revisionNumber: maxRevisionNumber + 1,
        title: PAGE_TITLE,
        slug: PAGE_SLUG,
        content,
        seo,
        createdBy: author.id,
      })
      .returning();

    await tx
      .update(pageEntity)
      .set({ publishedRevisionId: revision.id })
      .where(eq(pageEntity.id, locked.id));
  });

  return { created: 0, updated: 1, unchanged: 0 };
}

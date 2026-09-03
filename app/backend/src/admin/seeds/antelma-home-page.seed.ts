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
const PAGE_SLUG = 'home';
const PAGE_TITLE = 'Antelma - Soluzioni IT & TLC Enterprise';

/**
 * Blueprint statico della Homepage (F17-01). Stesso principio di
 * `antelma-contact.seed.ts`: solo prop realmente dichiarate dal registro di
 * produzione (`blocks/block-registry.ts`), nessun `kind` inventato. Il
 * pulsante "Richiedi un Contatto" punta a `/contatti-antelma` (slug reale
 * della pagina Contatti già seedata — non `/contatti`, che non risolve a
 * nessuna Pagina: stessa cautela già osservata per i link di footer in
 * `antelma-contact.seed.ts`, "nessuna rotta non confermata in docs/").
 * "Punti di Forza" è una `section` a tre colonne (`columns: '3'`) con tre
 * `container` diretti, stesso pattern delle colonne di footer in
 * `antelma-global-sections.seed.ts` (`heading` + `richText`, non prop-array:
 * nessun `kind` "lista" nel `PropKind` chiuso di ADR-21 § 4).
 */
function buildAntelmaHomeBlocks(): BlockNode[] {
  const heroSection: BlockNode = {
    id: 'home-hero-section',
    type: 'section',
    v: 1,
    props: {
      contentWidth: 'full-width',
      styleBackground: { default: 'accent' },
      stylePaddingTop: { default: '96' },
      stylePaddingBottom: { default: '96' },
    },
    children: [
      {
        id: 'home-hero-heading',
        type: 'heading',
        v: 1,
        props: {
          level: 'h2',
          text: PAGE_TITLE,
          styleTextColor: { default: 'inverse' },
          styleTextAlign: 'center',
          styleFontSize: { default: 'xl' },
          styleFontWeight: { default: 'bold' },
        },
        children: [],
      },
      {
        id: 'home-hero-subtitle',
        type: 'richText',
        v: 1,
        props: {
          html:
            '<p>Connettività, Cloud e Security per le aziende che non possono permettersi ' +
            'un fermo: un unico interlocutore per l’infrastruttura IT &amp; TLC.</p>',
          styleTextColor: { default: 'inverse' },
        },
        children: [],
      },
      {
        id: 'home-hero-cta-wrapper',
        type: 'container',
        v: 1,
        props: { justifyContent: { default: 'center' } },
        children: [
          {
            id: 'home-hero-cta',
            type: 'button',
            v: 1,
            props: {
              label: 'Richiedi un Contatto',
              href: '/contatti-antelma',
              styleBackgroundColor: '#ffffff',
              styleColor: '#13315c',
              styleFontWeight: { default: 'bold' },
            },
            children: [],
          },
        ],
      },
    ],
  };

  const strengthsSection: BlockNode = {
    id: 'home-strengths-section',
    type: 'section',
    v: 1,
    props: {
      columns: { default: '3' },
      gap: { default: 'lg' },
      contentWidth: 'boxed',
      stylePaddingTop: { default: '64' },
      stylePaddingBottom: { default: '64' },
    },
    children: [
      {
        id: 'home-strength-1',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          { id: 'home-strength-1-heading', type: 'heading', v: 1, props: { level: 'h3', text: 'Affidabilità' }, children: [] },
          {
            id: 'home-strength-1-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>SLA enterprise e assistenza certificata su ogni servizio erogato.</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'home-strength-2',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          { id: 'home-strength-2-heading', type: 'heading', v: 1, props: { level: 'h3', text: 'Competenza' }, children: [] },
          {
            id: 'home-strength-2-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Oltre trent’anni di esperienza in reti, cloud e sicurezza informatica.</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'home-strength-3',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' }, gap: { default: 'sm' } },
        children: [
          { id: 'home-strength-3-heading', type: 'heading', v: 1, props: { level: 'h3', text: 'Vicinanza' }, children: [] },
          {
            id: 'home-strength-3-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Un unico interlocutore, dal sopralluogo alla manutenzione continuativa.</p>' },
            children: [],
          },
        ],
      },
    ],
  };

  return [heroSection, strengthsSection];
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
 * di Nest (`BlockTreeValidatorService`/`BlockPropSanitizerService` sono puri,
 * nessun I/O) — stesso motivo di `antelma-contact.seed.ts`.
 */
function buildPersistableContentTree(): ContentTree {
  const rawTree: ContentTree = { version: ENVELOPE_VERSION, blocks: buildAntelmaHomeBlocks() };
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
export interface AntelmaHomePageSeedResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Crea o ripubblica la Homepage (`/home`), idempotente per `slug`+`locale`
 * (indice unico sulle pagine root attive, `db/schema.ts`). Stessa strategia
 * di scrittura di `antelmaContactSeed`: SELECT preventiva deliberata (script
 * mono-processo, nessuna race condition da un endpoint pubblico concorrente).
 */
export async function antelmaHomePageSeed(dbService: DbService): Promise<AntelmaHomePageSeedResult> {
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
      'Antelma: soluzioni IT & TLC enterprise, connettività, cloud e security per aziende che ' +
      'non possono permettersi un fermo.',
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

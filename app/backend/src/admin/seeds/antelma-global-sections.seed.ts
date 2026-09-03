import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { and, eq, isNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { fileEntity, globalSectionEntity, pageEntity, userEntity } from '../../db/schema';
import { AppConstants } from '../../common/app-constants';
import { AppUserRoles, GlobalSectionLayoutSlot } from '../../common/enums';
import { Utils } from '../../common/utils';
import {
  BlockNode,
  ContentTree,
  assertPayloadWithinLimit,
  assertValidContentTreeShape,
} from '../../pages/content-tree';
import { DEFAULT_BLOCK_REGISTRY } from '../../blocks/block-registry';
import { ENVELOPE_VERSION } from '../../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../../blocks/migration/block-migration.types';
import { BlockTreeValidatorService } from '../../blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../blocks/validator/validatable-node.types';
import { BlockPropSanitizerService } from '../../common/sanitizer/block-prop-sanitizer.service';
import { detectRasterMimeType } from '../../files/public-media/raster-mime-sniffer';
import { LocalDiskDriver } from '../../files/storage/local-disk.driver';
import { S3CompatibleDriver } from '../../files/storage/s3-compatible.driver';
import { StorageDriver } from '../../files/storage/storage-driver.interface';

/**
 * Contenuto di riferimento (screenshot forniti dall'utente in chat, brand
 * "Antelma Business Solutions", 2026-09-02). Il logo è un blocco `image`
 * (F15-02, 2026-09-03): `app/frontend/public/logo.png`, registrato come file
 * editoriale con `guid` fisso {@link LOGO_FILE_GUID}, stesso principio di
 * {@link HERO_IMAGE_FILE_GUID} in `antelma-contact.seed.ts` — un `mediaRef`
 * valida solo la forma del guid (16 hex), non un percorso statico.
 *
 * La riga di navigazione dell'Header è un blocco `navMenu` con tre
 * `navMenuItem` (F17-01, ADR-52): Home/Chi Siamo/Contatti, ciascuno con
 * `pageGuid` risolto per `slug` dalle pagine già seedate da
 * `antelma-home-page.seed.ts`/`antelma-chi-siamo-page.seed.ts`/
 * `antelma-contact.seed.ts` (`resolvePageGuid` sotto) — mai un `guid`
 * letterale: la colonna `pages.guid` è `char(16)` esadecimale generata da
 * `Utils.randomString` (`db/schema.ts`), non un valore scelto in anticipo.
 * L'ordine di esecuzione in `SeedService.run()` non è intercambiabile: le tre
 * Pagine devono esistere prima che questo seed giri. Il CTA "Contattaci"
 * resta un `button` verso `/contatti-antelma`, invariato.
 */
const HEADER_SLUG = 'header-principale';
const HEADER_TITLE = 'Header principale';
const FOOTER_SLUG = 'footer-principale';
const FOOTER_TITLE = 'Footer principale';

const BRAND_NAVY = '#13315c';

/**
 * `guid` fisso della riga `files` che referenzia il logo dell'Header
 * (`mediaRef` su `image`) — `a1b2c3d4e5f60001`/`a1b2c3d4e5f60002` sono già
 * occupati da `antelma-contact.seed.ts` (sfondo Hero/Sub-Footer), quindi il
 * logo prende il prossimo guid libero della stessa sequenza.
 */
const LOGO_FILE_GUID = 'a1b2c3d4e5f60003';
const LOGO_ASSET_PATH = path.resolve(__dirname, '../../../../frontend/public/logo.png');

/** Sceglie l'implementazione di `StorageDriver` coerente con `AppConstants.storageDriver` — stesso criterio di `antelma-contact.seed.ts`. */
function resolveStorageDriver(): StorageDriver {
  return AppConstants.storageDriver === 's3' ? new S3CompatibleDriver() : new LocalDiskDriver();
}

/**
 * Registra, in modo idempotente per `guid` fisso, `logo.png` come file
 * editoriale (`entity: 'page-media'`) — stessa funzione di
 * `ensureAntelmaHeroImageFile` in `antelma-contact.seed.ts`, duplicata qui
 * perché i due seed set restano indipendenti (nessun modulo condiviso fra
 * le due funzioni di seed). MIME dai byte reali, mai dall'estensione.
 */
async function ensureAntelmaLogoFile(dbService: DbService, authorId: number): Promise<void> {
  const db = dbService.db;
  const existing = await db.query.fileEntity.findFirst({
    where: eq(fileEntity.guid, LOGO_FILE_GUID),
  });
  if (existing) {
    return;
  }

  const buffer = await readFile(LOGO_ASSET_PATH);
  const mimeType = detectRasterMimeType(buffer);
  if (!mimeType) {
    throw new Error(
      `Seed sezioni globali: "${LOGO_ASSET_PATH}" non riconosciuto come immagine raster.`,
    );
  }

  const storageKey = `seed-${LOGO_FILE_GUID}`;
  await resolveStorageDriver().upload(storageKey, buffer, mimeType);

  await db.insert(fileEntity).values({
    guid: LOGO_FILE_GUID,
    originalName: 'logo.png',
    mimeType,
    sizeBytes: buffer.length,
    storageDriver: AppConstants.storageDriver,
    storageKey,
    checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    entity: 'page-media',
    createdBy: authorId,
    updatedBy: authorId,
  });
}

/** `pageGuid` delle tre Pagine collegate dal `navMenu` dell'Header (F17-01, ADR-52). */
interface NavMenuPageGuids {
  home: string;
  chiSiamo: string;
  contatti: string;
}

function buildHeaderBlocks(navMenuPageGuids: NavMenuPageGuids): BlockNode[] {
  return [
    {
      id: 'antelma-gs-header-section',
      type: 'section',
      v: 1,
      props: {
        styleBackgroundColor: '#ffffff',
        stylePaddingTop: { default: '16' },
        stylePaddingBottom: { default: '16' },
        stylePaddingLeft: { default: '24' },
        stylePaddingRight: { default: '24' },
        contentWidth: 'boxed',
        maxWidth: 'xl',
        columns: { default: '1' },
      },
      children: [
        {
          id: 'antelma-gs-header-row',
          type: 'container',
          v: 1,
          props: {
            flexDirection: { default: 'row' },
            justifyContent: { default: 'space-between' },
            alignItems: { default: 'center' },
            gap: { default: 'md' },
            wrap: { default: 'wrap' },
          },
          children: [
            {
              // Colonna 1/12 — layout a 12 colonne (F15-02): 3/12 = 25% via
              // `styleFlexBasis` su `container` (`colSpan` non esiste fuori da
              // `form-field`, ADR-51 § ambito — nessuna prop inventata sul registro).
              id: 'antelma-gs-header-logo-col',
              type: 'container',
              v: 1,
              props: {
                styleFlexBasis: { value: 25, unit: '%' },
                alignItems: { default: 'center' },
              },
              children: [
                {
                  id: 'antelma-gs-header-logo',
                  type: 'image',
                  v: 1,
                  props: {
                    mediaRef: LOGO_FILE_GUID,
                    alt: 'Antelma Logo',
                  },
                  children: [],
                },
              ],
            },
            {
              // Colonna 2/12 — 9/12 = 75%: nav + CTA "Contattaci" nello stesso gruppo.
              id: 'antelma-gs-header-nav-col',
              type: 'container',
              v: 1,
              props: {
                styleFlexBasis: { value: 75, unit: '%' },
                flexDirection: { default: 'row' },
                justifyContent: { default: 'space-between' },
                alignItems: { default: 'center' },
                gap: { default: 'lg' },
                wrap: { default: 'wrap' },
              },
              children: [
                {
                  // navMenu (F17-01, ADR-52 § 1): contenitore dedicato, tre `navMenuItem`
                  // come figli — composizione a children, non prop-array (ADR-52 § 1).
                  id: 'antelma-gs-header-nav',
                  type: 'navMenu',
                  v: 1,
                  props: {},
                  children: [
                    { id: 'antelma-gs-header-nav-home', label: 'Home', pageGuid: navMenuPageGuids.home },
                    {
                      id: 'antelma-gs-header-nav-chi-siamo',
                      label: 'Chi Siamo',
                      pageGuid: navMenuPageGuids.chiSiamo,
                    },
                    {
                      id: 'antelma-gs-header-nav-contatti',
                      label: 'Contatti',
                      pageGuid: navMenuPageGuids.contatti,
                    },
                  ].map(({ id, label, pageGuid }) => ({
                    id,
                    type: 'navMenuItem',
                    v: 1,
                    props: { label, pageGuid },
                    children: [],
                  })),
                },
                {
                  id: 'antelma-gs-header-cta',
                  type: 'button',
                  v: 1,
                  props: {
                    label: 'Contattaci',
                    href: '/contatti-antelma',
                    styleBackgroundColor: BRAND_NAVY,
                    styleColor: '#ffffff',
                    styleFontWeight: { default: 'bold' },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function footerColumn(id: string, headingText: string, items: string[]): BlockNode {
  return {
    id,
    type: 'container',
    v: 1,
    props: {
      flexDirection: { default: 'column' },
      gap: { default: 'sm' },
    },
    children: [
      {
        id: `${id}-heading`,
        type: 'heading',
        v: 1,
        props: { level: 'h4', text: headingText, styleTextColorCustom: '#ffffff' },
        children: [],
      },
      {
        id: `${id}-links`,
        type: 'richText',
        v: 1,
        props: {
          html: `<p>${items.join('<br />')}</p>`,
          styleFontSize: { default: 'sm' },
          styleTextColorCustom: '#ffffff',
        },
        children: [],
      },
    ],
  };
}

function buildFooterBlocks(): BlockNode[] {
  return [
    {
      id: 'antelma-gs-footer-section',
      type: 'section',
      v: 1,
      props: {
        styleBackgroundColor: '#2e6bc6',
        styleColor: '#ffffff',
        stylePaddingTop: { default: '48' },
        stylePaddingBottom: { default: '24' },
        stylePaddingLeft: { default: '24' },
        stylePaddingRight: { default: '24' },
        columns: { default: '4' },
        gap: { default: 'md' },
        // full-width (F15-02): `boxed`/`maxWidth: 'md'` (default) limitava lo sfondo blu a
        // 1140px centrati, lasciando bande bianche ai lati oltre quella soglia — lo sfondo
        // deve coprire l'intero viewport, il padding laterale (righe 168-169 sopra) evita che
        // il contenuto tocchi il bordo.
        contentWidth: 'full-width',
      },
      children: [
        {
          id: 'antelma-gs-footer-brand',
          type: 'container',
          v: 1,
          props: {
            flexDirection: { default: 'column' },
            gap: { default: 'sm' },
          },
          children: [
            {
              id: 'antelma-gs-footer-brand-heading',
              type: 'heading',
              v: 1,
              props: {
                level: 'h3',
                text: 'ANTELMA',
                styleTextColorCustom: '#ffffff',
                styleFontWeight: { default: 'bold' },
                styleFontSizeCustom: { value: 22, unit: 'px' },
                styleFontFamily: { default: 'montserrat' },
              },
              children: [],
            },
          ],
        },
        footerColumn('antelma-gs-footer-col-gruppo', 'GRUPPO ANTELMA', [
          'Chi Siamo',
          'Lavora Con Noi',
        ]),
        footerColumn('antelma-gs-footer-col-soluzioni', 'SOLUZIONI', [
          'Rete &amp; Connettività',
          'Voice &amp; Collaboration',
        ]),
        footerColumn('antelma-gs-footer-col-risorse', 'ALTRE RISORSE', ['News', 'Contatti']),
        {
          id: 'antelma-gs-footer-legal-row',
          type: 'container',
          v: 1,
          props: {
            flexDirection: { default: 'row' },
            justifyContent: { default: 'flex-start' },
          },
          children: [
            {
              id: 'antelma-gs-footer-legal-text',
              type: 'richText',
              v: 1,
              props: {
                html:
                  '<p>© 2026 All Rights Reserved Antelma S.r.l. | Sede Legale: Via Gavinana, 3 – 21052 ' +
                  'Busto Arsizio (VA) | Partita Iva e Codice Fiscale N. 01814180129 | Società iscritta al ' +
                  'Registro delle Imprese di Varese al n. 01814180129 | Tel.: 0331 651.811 – Fax: 0331 651.888 ' +
                  '| email: info@antelma.it</p>',
                styleFontSize: { default: 'sm' },
                styleTextColorCustom: '#ffffff',
              },
              children: [],
            },
          ],
        },
        {
          id: 'antelma-gs-footer-policy-row',
          type: 'container',
          v: 1,
          props: {
            flexDirection: { default: 'row' },
            justifyContent: { default: 'flex-start' },
          },
          children: [
            {
              id: 'antelma-gs-footer-policy-text',
              type: 'richText',
              v: 1,
              props: {
                html: '<p>Privacy Policy | Cookie Policy</p>',
                styleFontSize: { default: 'sm' },
                styleTextColorCustom: '#ffffff',
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * Stessa pipeline di scrittura di `GlobalSectionsService.runWriteContentPipeline`
 * (migrazione → validazione di registro → sanitizzazione per `kind` → limite
 * payload "persist", ADR-21 § 3), replicata qui senza contesto DI di Nest per
 * lo stesso motivo di `antelma-contact.seed.ts` (`BlockTreeValidatorService`/
 * `BlockPropSanitizerService` sono puri, nessun I/O).
 */
function buildPersistableContentTree(blocks: BlockNode[]): ContentTree {
  const rawTree: ContentTree = { version: ENVELOPE_VERSION, blocks };
  assertValidContentTreeShape(rawTree);

  const migration = migrateBlockTree(
    rawTree.blocks as unknown as MigratableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
  );
  if (migration.errors.length > 0) {
    throw new Error(
      `Seed sezioni globali: migrazione fallita — ${JSON.stringify(migration.errors[0])}`,
    );
  }

  const validator = new BlockTreeValidatorService();
  const validation = validator.validateTree(
    migration.blocks as ValidatableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
    {
      roleLevel: AppUserRoles.SuperAdmin,
    },
  );
  if (!validation.valid) {
    throw new Error(
      `Seed sezioni globali: albero non valido — ${JSON.stringify(validation.errors[0])}`,
    );
  }

  const sanitizer = new BlockPropSanitizerService();
  const sanitized = sanitizer.sanitizeTree(
    migration.blocks as ValidatableBlockNode[],
    DEFAULT_BLOCK_REGISTRY,
  );
  if (sanitized.errors.length > 0) {
    throw new Error(
      `Seed sezioni globali: sanitizzazione fallita — ${JSON.stringify(sanitized.errors[0])}`,
    );
  }

  const persistable: ContentTree = {
    version: ENVELOPE_VERSION,
    blocks: sanitized.tree as unknown as BlockNode[],
  };
  assertPayloadWithinLimit(persistable, 'persist');
  return persistable;
}

export interface GlobalSectionSeedResult {
  created: number;
  updated: number;
  unchanged: number;
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

async function upsertGlobalSection(
  dbService: DbService,
  authorId: number,
  layoutSlot: GlobalSectionLayoutSlot,
  slug: string,
  title: string,
  content: ContentTree,
): Promise<GlobalSectionSeedResult> {
  const db = dbService.db;

  const existing = await db.query.globalSectionEntity.findFirst({
    where: and(
      eq(globalSectionEntity.layoutSlot, layoutSlot),
      eq(globalSectionEntity.isActive, true),
    ),
  });

  if (!existing) {
    await db.insert(globalSectionEntity).values({
      guid: Utils.randomString(16),
      title,
      slug,
      layoutSlot,
      isSticky: false,
      content,
      createdBy: authorId,
      updatedBy: authorId,
    });
    return { created: 1, updated: 0, unchanged: 0 };
  }

  const unchanged = canonicalJson(existing.content) === canonicalJson(content);
  if (unchanged) {
    return { created: 0, updated: 0, unchanged: 1 };
  }

  const [locked] = await db
    .update(globalSectionEntity)
    .set({
      content,
      version: existing.version + 1,
      updatedAt: new Date(),
      updatedBy: authorId,
    })
    .where(
      and(
        eq(globalSectionEntity.id, existing.id),
        eq(globalSectionEntity.version, existing.version),
      ),
    )
    .returning();

  if (!locked) {
    throw new Error(
      `Seed sezione globale "${slug}": conflitto di concorrenza — un altro processo ha modificato la riga durante il seed.`,
    );
  }

  return { created: 0, updated: 1, unchanged: 0 };
}

/**
 * Risolve il `guid` (16 hex, stabile dopo la prima creazione — mai un
 * letterale, `db/schema.ts`) della Pagina root attiva per `slug`+`locale`
 * (F17-01, ADR-52 § 3: `pageGuid` di `navMenuItem` è una forma, non una
 * verifica di esistenza a scrittura — qui invece la Pagina deve esistere
 * davvero, perché il seed la crea nello stesso processo). SELECT preventiva
 * deliberata, stesso principio di `antelmaContactSeed` (script mono-processo).
 */
async function resolvePageGuid(dbService: DbService, slug: string, locale: string): Promise<string> {
  const page = await dbService.db.query.pageEntity.findFirst({
    where: and(eq(pageEntity.slug, slug), eq(pageEntity.locale, locale), isNull(pageEntity.parentId)),
  });
  if (!page) {
    throw new Error(
      `Seed sezioni globali: Pagina "${slug}" non trovata — eseguire prima i seed delle Pagine (F17-01).`,
    );
  }
  return page.guid;
}

/**
 * Sostituisce il contenuto placeholder di test ("HEADER GLOBALE"/"PIEDE
 * GLOBALE — (c) 2026") delle Sezioni Globali `header`/`footer` già attive
 * (righe id=1/id=2, precedenti a questo seed) con un blueprint di brand,
 * idempotente per `layoutSlot` (indice unico sulle righe attive). Non tocca
 * `isSticky`/`title`/`slug` di righe esistenti: solo `content`. Dipende dalle
 * tre Pagine di F17-01 (Home/Chi Siamo/Contatti) già seedate — l'ordine in
 * `SeedService.run()` non è intercambiabile.
 */
export async function antelmaGlobalSectionsSeed(dbService: DbService): Promise<{
  header: GlobalSectionSeedResult;
  footer: GlobalSectionSeedResult;
}> {
  const db = dbService.db;
  const author = await db.query.userEntity.findFirst({
    where: eq(userEntity.role, AppUserRoles.SuperAdmin),
  });
  if (!author) {
    throw new Error(
      'Seed sezioni globali: nessun utente SuperAdmin trovato — eseguire prima il seed utenti.',
    );
  }

  await ensureAntelmaLogoFile(dbService, author.id);

  const locale = AppConstants.defaultLocale;
  const navMenuPageGuids = {
    home: await resolvePageGuid(dbService, 'home', locale),
    chiSiamo: await resolvePageGuid(dbService, 'chi-siamo', locale),
    contatti: await resolvePageGuid(dbService, 'contatti-antelma', locale),
  };

  const headerContent = buildPersistableContentTree(buildHeaderBlocks(navMenuPageGuids));
  const footerContent = buildPersistableContentTree(buildFooterBlocks());

  const header = await upsertGlobalSection(
    dbService,
    author.id,
    GlobalSectionLayoutSlot.Header,
    HEADER_SLUG,
    HEADER_TITLE,
    headerContent,
  );
  const footer = await upsertGlobalSection(
    dbService,
    author.id,
    GlobalSectionLayoutSlot.Footer,
    FOOTER_SLUG,
    FOOTER_TITLE,
    footerContent,
  );

  return { header, footer };
}

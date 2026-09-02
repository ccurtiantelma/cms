import { and, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { globalSectionEntity, userEntity } from '../../db/schema';
import { AppUserRoles, GlobalSectionLayoutSlot } from '../../common/enums';
import { Utils } from '../../common/utils';
import { BlockNode, ContentTree, assertPayloadWithinLimit, assertValidContentTreeShape } from '../../pages/content-tree';
import { DEFAULT_BLOCK_REGISTRY } from '../../blocks/block-registry';
import { ENVELOPE_VERSION } from '../../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../../blocks/migration/block-migration.types';
import { BlockTreeValidatorService } from '../../blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../blocks/validator/validatable-node.types';
import { BlockPropSanitizerService } from '../../common/sanitizer/block-prop-sanitizer.service';

/**
 * Contenuto di riferimento (screenshot forniti dall'utente in chat, brand
 * "Antelma Business Solutions", 2026-09-02): niente logo/foto reali — nessun
 * asset caricato in `files` corrisponde al logo o alle fotografie del sito
 * di riferimento, quindi il "logo" è un `heading` testuale, non un blocco
 * `image`. Nessun blocco di navigazione con sottomenu/dropdown nel registro:
 * le voci di menu sono etichette `richText` non cliccabili, non `button` —
 * stesso principio già dichiarato in `antelma-contact.seed.ts` per i link di
 * footer, "nessuna pagina/rotta con quei percorsi è confermata in docs/".
 * L'unico link reale è il CTA "Contattaci" verso `/contatti-antelma`, rotta
 * già pubblicata da questo stesso seed set.
 */
const HEADER_SLUG = 'header-principale';
const HEADER_TITLE = 'Header principale';
const FOOTER_SLUG = 'footer-principale';
const FOOTER_TITLE = 'Footer principale';

const BRAND_NAVY = '#13315c';

function buildHeaderBlocks(): BlockNode[] {
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
              id: 'antelma-gs-header-logo',
              type: 'heading',
              v: 1,
              props: {
                level: 'h3',
                text: 'ANTELMA',
                styleTextColorCustom: BRAND_NAVY,
                styleFontWeight: { default: 'bold' },
                styleFontSizeCustom: { value: 22, unit: 'px' },
                styleFontFamily: { default: 'montserrat' },
              },
              children: [],
            },
            {
              id: 'antelma-gs-header-nav',
              type: 'container',
              v: 1,
              props: {
                flexDirection: { default: 'row' },
                gap: { default: 'lg' },
                alignItems: { default: 'center' },
                wrap: { default: 'wrap' },
              },
              children: [
                'Chi Siamo',
                'Le Nostre Soluzioni',
                'Assistenza IT &amp; TLC Certificata',
                'News Tech &amp; IT',
              ].map((label, index) => ({
                id: `antelma-gs-header-nav-${index}`,
                type: 'richText',
                v: 1,
                props: {
                  html: `<p>${label}</p>`,
                  styleFontSize: { default: 'sm' },
                  styleFontWeight: { default: 'medium' },
                  styleTextColorCustom: BRAND_NAVY,
                },
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
        contentWidth: 'boxed',
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
        footerColumn('antelma-gs-footer-col-gruppo', 'GRUPPO ANTELMA', ['Chi Siamo', 'Lavora Con Noi']),
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

  const migration = migrateBlockTree(rawTree.blocks as unknown as MigratableBlockNode[], DEFAULT_BLOCK_REGISTRY);
  if (migration.errors.length > 0) {
    throw new Error(`Seed sezioni globali: migrazione fallita — ${JSON.stringify(migration.errors[0])}`);
  }

  const validator = new BlockTreeValidatorService();
  const validation = validator.validateTree(migration.blocks as ValidatableBlockNode[], DEFAULT_BLOCK_REGISTRY, {
    roleLevel: AppUserRoles.SuperAdmin,
  });
  if (!validation.valid) {
    throw new Error(`Seed sezioni globali: albero non valido — ${JSON.stringify(validation.errors[0])}`);
  }

  const sanitizer = new BlockPropSanitizerService();
  const sanitized = sanitizer.sanitizeTree(migration.blocks as ValidatableBlockNode[], DEFAULT_BLOCK_REGISTRY);
  if (sanitized.errors.length > 0) {
    throw new Error(`Seed sezioni globali: sanitizzazione fallita — ${JSON.stringify(sanitized.errors[0])}`);
  }

  const persistable: ContentTree = { version: ENVELOPE_VERSION, blocks: sanitized.tree as unknown as BlockNode[] };
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
    where: and(eq(globalSectionEntity.layoutSlot, layoutSlot), eq(globalSectionEntity.isActive, true)),
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
    .where(and(eq(globalSectionEntity.id, existing.id), eq(globalSectionEntity.version, existing.version)))
    .returning();

  if (!locked) {
    throw new Error(
      `Seed sezione globale "${slug}": conflitto di concorrenza — un altro processo ha modificato la riga durante il seed.`,
    );
  }

  return { created: 0, updated: 1, unchanged: 0 };
}

/**
 * Sostituisce il contenuto placeholder di test ("HEADER GLOBALE"/"PIEDE
 * GLOBALE — (c) 2026") delle Sezioni Globali `header`/`footer` già attive
 * (righe id=1/id=2, precedenti a questo seed) con un blueprint di brand,
 * idempotente per `layoutSlot` (indice unico sulle righe attive). Non tocca
 * `isSticky`/`title`/`slug` di righe esistenti: solo `content`.
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
    throw new Error('Seed sezioni globali: nessun utente SuperAdmin trovato — eseguire prima il seed utenti.');
  }

  const headerContent = buildPersistableContentTree(buildHeaderBlocks());
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

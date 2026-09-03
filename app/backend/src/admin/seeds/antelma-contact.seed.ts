import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { fileEntity, pageEntity, pageRevisionEntity, userEntity } from '../../db/schema';
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
import { detectRasterMimeType } from '../../files/public-media/raster-mime-sniffer';
import { LocalDiskDriver } from '../../files/storage/local-disk.driver';
import { S3CompatibleDriver } from '../../files/storage/s3-compatible.driver';
import { StorageDriver } from '../../files/storage/storage-driver.interface';

/** Slug pubblico della pagina, unico per `locale` fra le pagine root attive. */
const PAGE_SLUG = 'contatti-antelma';
const PAGE_TITLE = 'Antelma - Richiedi un Contatto';

/**
 * `guid` fisso della riga `files` che referenzia lo sfondo dell'Hero
 * (`styleBackgroundImageRef`, `kind: 'mediaRef'` — un percorso statico non
 * supera `GUID_PATTERN` in `block-tree-validator.service.ts`, quindi l'unico
 * modo per collegare `/Antelma-pit.png` è registrarlo come file editoriale
 * vero, vedi {@link ensureAntelmaHeroImageFile}).
 */
const HERO_IMAGE_FILE_GUID = 'a1b2c3d4e5f60001';
/** Asset statico del frontend da registrare come file editoriale (mai servito da `app/frontend/public` in produzione). */
const HERO_IMAGE_ASSET_PATH = path.resolve(
  __dirname,
  '../../../../frontend/public/Antelma-pit.png',
);

/**
 * Serializzazione canonica (chiavi di ogni oggetto in ordine alfabetico,
 * ricorsiva) per il confronto "contenuto invariato" fra `draftContent`/`draftSeo`
 * appena costruiti e quelli già persistiti. `JSON.stringify` diretto non è
 * sufficiente: `jsonb` di Postgres non garantisce di preservare l'ordine di
 * inserimento delle chiavi al round-trip, quindi due alberi semanticamente
 * identici potrebbero serializzarsi in stringhe diverse e far scattare
 * un aggiornamento/una Revisione spuria a ogni riesecuzione del seed.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
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
 * Blueprint statico "Antelma - Richiedi un Contatto" (ADR-21 § schema blocchi,
 * ADR-50 § `styleBackgroundType`/overlay su `section`, ADR-51 § `colSpan` su
 * `form-field`, ADR-39 § `container` flex a nesting ricorsivo, ADR-46 § form
 * dinamici). Stessa forma — stessi `id`, `type`, `props`, `children`, stesso
 * ordine — della fixture di riferimento del contenuto pubblicato
 * (`app/frontend/src/test/fixtures/antelma-contatti.seed.ts`, sorgente di
 * verità del brief per questa pagina), tradotta da `RenderableBlockNode` a
 * {@link BlockNode} aggiungendo `v: 1` a ogni nodo (ADR-21 § 1: assente sul
 * tipo frontend, obbligatorio in scrittura lato backend). Solo prop
 * realmente dichiarate dal registro di produzione (`blocks/block-registry.ts`):
 * niente `style` libero, niente prop inventate — ADR-21 § 4 tratta un `kind`
 * aggiuntivo come nuovo schema di blocco, non qualcosa che si introduce in un
 * seed.
 *
 * Due scostamenti dal brief letterale, entrambi ereditati dalla fixture ed
 * entrambi per rispettare lo schema del registro già approvato (mai una
 * prop/valore inventati fuori ADR):
 * - Titolo Hero e Sub-Footer a `level: 'h2'`/`'h3'`, mai `h1` — l'enum di
 *   `heading` lo esclude, riservato al template del consumer HTML
 *   (`heading.block.ts`, SPEC-F02-blocchi.md § 3.3).
 * - Pulsante telefono con `href` root-relative (`/contatti`), non `tel:` —
 *   `kind: 'url'` ammette solo `http`/`https`/`mailto`/root-relative
 *   (`isAllowedUrl`, `block-tree-validator.service.ts`); il rilievo "danger"
 *   è reso con `styleBackgroundColor`/`styleTextColor` (`kind: 'color'`),
 *   perché `button` non dichiara una prop `variant` (`button.block.ts`).
 *
 * Il quarto `section` di primo livello ("Footer istituzionale a 4 colonne")
 * **non** è cromatura di layout: è contenuto della Pagina stessa (blocchi
 * `container`/`heading`/`richText` dentro l'albero di `contatti-antelma`),
 * non l'header/footer di sito gestito dalle Sezioni Globali
 * (`antelma-global-sections.seed.ts`, ADR-40) — le due cose coesistono senza
 * conflitto: questo è un blocco di chiusura specifico della pagina Contatti,
 * non il chrome renderizzato da `PageView` attorno a ogni Pagina.
 */
function buildAntelmaContactBlocks(): BlockNode[] {
  const heroSection: BlockNode = {
    id: 'hero-section',
    type: 'section',
    v: 1,
    props: {
      contentWidth: 'full-width',
      styleBackgroundType: 'image',
      styleBackgroundImageRef: HERO_IMAGE_FILE_GUID,
      styleBackgroundPosition: 'center center',
      styleBackgroundSize: 'cover',
      styleOverlayColor: '#0c2340',
      styleOverlayOpacity: 0.6,
      stylePaddingTop: { default: '96' },
      stylePaddingBottom: { default: '96' },
    },
    children: [
      {
        id: 'hero-heading',
        type: 'heading',
        v: 1,
        props: {
          level: 'h2',
          text: 'RICHIEDI UN CONTATTO ANTELMA',
          styleTextColor: { default: 'inverse' },
          styleTextAlign: 'center',
          styleFontSize: { default: 'xl' },
          styleFontWeight: { default: 'bold' },
        },
        children: [],
      },
    ],
  };

  const formSection: BlockNode = {
    id: 'form-section',
    type: 'section',
    v: 1,
    props: {
      // "large" (brief) mappato al token dichiarato più vicino: la scala di
      // `stylePaddingTop`/`stylePaddingBottom` è numerica (0-96px), nessun valore 'large'.
      stylePaddingTop: { default: '64' },
      stylePaddingBottom: { default: '64' },
    },
    children: [
      {
        id: 'form-heading',
        type: 'heading',
        v: 1,
        props: {
          level: 'h2',
          text: 'Hai necessità di ricevere un nostro contatto?',
          styleTextAlign: 'center',
        },
        children: [],
      },
      {
        id: 'form-phone-cta-wrapper',
        type: 'container',
        v: 1,
        props: {
          justifyContent: { default: 'center' },
        },
        children: [
          {
            id: 'form-phone-cta',
            type: 'button',
            v: 1,
            props: {
              label: '+39 0331 651 811',
              href: '/contatti',
              styleBackgroundColor: '#c0392b',
              styleTextColor: { default: 'inverse' },
            },
            children: [],
          },
        ],
      },
      {
        id: 'contact-form',
        type: 'form',
        v: 1,
        props: { formKey: 'antelma-contatti' },
        children: [
          {
            id: 'field-nome',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'text',
              name: 'nome',
              label: 'Nome',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-cognome',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'text',
              name: 'cognome',
              label: 'Cognome',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-azienda',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'text',
              name: 'azienda',
              label: 'Azienda',
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-telefono',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'text',
              name: 'telefono',
              label: 'Telefono',
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-email',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'email',
              name: 'email',
              label: 'Email',
              required: true,
              colSpan: { default: '6' },
            },
            children: [],
          },
          {
            id: 'field-note',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'textarea',
              name: 'note',
              label: 'Note / Messaggio',
              colSpan: { default: '12' },
            },
            children: [],
          },
          {
            id: 'field-privacy',
            type: 'form-field',
            v: 1,
            props: {
              fieldType: 'checkbox',
              name: 'privacy',
              label: 'Ho letto e accetto la Privacy Policy',
              required: true,
              colSpan: { default: '12' },
            },
            children: [],
          },
          {
            id: 'field-submit',
            type: 'form-submit',
            v: 1,
            props: { label: 'Invia richiesta' },
            children: [],
          },
        ],
      },
    ],
  };

  const subfooterCtaSection: BlockNode = {
    id: 'subfooter-cta-section',
    type: 'section',
    v: 1,
    props: {
      contentWidth: 'full-width',
      styleBackgroundType: 'image',
      styleBackgroundImageRef: 'a1b2c3d4e5f60002',
      styleOverlayColor: '#051329',
      styleOverlayOpacity: 0.8,
    },
    children: [
      {
        id: 'subfooter-heading',
        type: 'heading',
        v: 1,
        props: {
          level: 'h3',
          text: "RIMANI IN CONNESSIONE CON L'INNOVAZIONE",
          styleTextColor: { default: 'inverse' },
          styleTextAlign: 'center',
        },
        children: [],
      },
      {
        id: 'subfooter-cta-button',
        type: 'button',
        v: 1,
        props: {
          label: 'ISCRIZIONE NEWSLETTER',
          href: '/newsletter',
          styleTextColor: { default: 'inverse' },
        },
        children: [],
      },
    ],
  };

  const footerSection: BlockNode = {
    id: 'footer-section',
    type: 'section',
    v: 1,
    props: {
      columns: { default: '4' },
      gap: { default: 'lg' },
      styleBackground: { default: 'inverse' },
    },
    children: [
      {
        id: 'footer-col-info',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-info-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h4', text: 'Antelma Group', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-info-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Informazioni societarie Antelma</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-group',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-group-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h4', text: 'Gruppo Antelma', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-group-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Le aziende del Gruppo Antelma</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-solutions',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-solutions-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h4', text: 'Soluzioni', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-solutions-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Le nostre soluzioni</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-col-resources',
        type: 'container',
        v: 1,
        props: { flexDirection: { default: 'column' } },
        children: [
          {
            id: 'footer-resources-heading',
            type: 'heading',
            v: 1,
            props: { level: 'h4', text: 'Altre risorse', styleTextColor: { default: 'inverse' } },
            children: [],
          },
          {
            id: 'footer-resources-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>Link utili</p>' },
            children: [],
          },
        ],
      },
      {
        id: 'footer-copyright-bar',
        type: 'container',
        v: 1,
        props: { justifyContent: { default: 'center' } },
        children: [
          {
            id: 'footer-copyright-text',
            type: 'richText',
            v: 1,
            props: { html: '<p>© 2026 Antelma Group. Tutti i diritti riservati.</p>' },
            children: [],
          },
        ],
      },
    ],
  };

  return [heroSection, formSection, subfooterCtaSection, footerSection];
}

/** Sceglie l'implementazione di `StorageDriver` coerente con `AppConstants.storageDriver` — stesso criterio di `files.module.ts`, qui istanziata direttamente (nessuna delle due classi ha dipendenze iniettate). */
function resolveStorageDriver(): StorageDriver {
  return AppConstants.storageDriver === 's3' ? new S3CompatibleDriver() : new LocalDiskDriver();
}

/**
 * Registra, in modo idempotente per `guid` fisso, l'asset statico
 * `Antelma-pit.png` come file editoriale (`entity: 'page-media'`, opt-in
 * richiesto da ADR-27 § 2 perché `PublicMediaController` lo serva su
 * `public/media/:guid`) — senza questa riga il `guid` referenziato
 * dall'Hero non risolve a nessun blob. MIME dai byte reali via
 * `detectRasterMimeType` (`business-rules.md` § Security "MIME da
 * contenuto reale, non estensione"), mai dall'estensione del file letto.
 * Se la riga esiste già (riesecuzioni successive del seed) non ricarica
 * il blob: stesso principio "nessuna scrittura spuria" di `canonicalJson`
 * sopra.
 */
async function ensureAntelmaHeroImageFile(dbService: DbService, authorId: number): Promise<void> {
  const db = dbService.db;
  const existing = await db.query.fileEntity.findFirst({
    where: eq(fileEntity.guid, HERO_IMAGE_FILE_GUID),
  });
  if (existing) {
    return;
  }

  const buffer = await readFile(HERO_IMAGE_ASSET_PATH);
  const mimeType = detectRasterMimeType(buffer);
  if (!mimeType) {
    throw new Error(
      `Seed "${PAGE_SLUG}": "${HERO_IMAGE_ASSET_PATH}" non riconosciuto come immagine raster.`,
    );
  }

  const storageKey = `seed-${HERO_IMAGE_FILE_GUID}`;
  await resolveStorageDriver().upload(storageKey, buffer, mimeType);

  await db.insert(fileEntity).values({
    guid: HERO_IMAGE_FILE_GUID,
    originalName: 'Antelma-pit.png',
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

/**
 * Esegue la stessa pipeline di scrittura di `PagesService` (migrazione →
 * validazione di registro → sanitizzazione per `kind` → controllo payload
 * "persist", ADR-21 § 3) sul blueprint statico sopra. `BlockTreeValidatorService`/
 * `BlockPropSanitizerService` non hanno dipendenze iniettate (puri, nessun I/O)
 * e sono quindi istanziabili direttamente qui, senza il contesto DI di Nest —
 * stesso vincolo di `db/seed.ts` (tsx non emette i metadati dei decoratori).
 * Un fallimento qui è un difetto del blueprint, non un caso applicativo: lancia
 * e interrompe il seed piuttosto che persistere un albero non valido.
 */
function buildPersistableContentTree(): ContentTree {
  const rawTree: ContentTree = { version: ENVELOPE_VERSION, blocks: buildAntelmaContactBlocks() };
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
export interface AntelmaContactSeedResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Crea o ripubblica la pagina "Antelma - Richiedi un Contatto" (`/contatti-antelma`),
 * idempotente per `slug`+`locale`: mai una riga duplicata (le pagine root attive
 * hanno un indice unico su `(locale, slug)`, `db/schema.ts`).
 *
 * Replica solo l'invariante di scrittura essenziale di `PagesService`
 * (`create` + pubblicazione transazionale: FK risolta inserendo prima la
 * Revisione e aggiornando poi `publishedRevisionId`, lock ottimistico su
 * `version` in aggiornamento) — **non** l'audit log, l'invalidazione cache
 * Redis né l'export BullMQ, che richiedono l'infrastruttura viva dell'app e
 * non hanno senso per uno script una tantum eseguito con `tsx` (stesso motivo
 * per cui `SeedService.seedDemo()` non scrive audit log per gli utenti demo).
 * La ricerca della riga esistente per `slug`+`locale` prima dell'INSERT è una
 * `SELECT` preventiva deliberata: il divieto di `business-rules.md` riguarda
 * la race condition di scritture concorrenti sull'endpoint pubblico, assente
 * in uno script mono-processo.
 */
export async function antelmaContactSeed(dbService: DbService): Promise<AntelmaContactSeedResult> {
  const db = dbService.db;
  const locale = AppConstants.defaultLocale;

  const author = await db.query.userEntity.findFirst({
    where: eq(userEntity.role, AppUserRoles.SuperAdmin),
  });
  if (!author) {
    throw new Error(
      `Seed "${PAGE_SLUG}": nessun utente SuperAdmin trovato — eseguire prima il seed utenti.`,
    );
  }

  await ensureAntelmaHeroImageFile(dbService, author.id);

  const content = buildPersistableContentTree();
  const seoSanitizer = new TreeSanitizerService();
  const seo = seoSanitizer.sanitizeTree({
    metaTitle: PAGE_TITLE,
    metaDescription:
      'Richiedi un contatto con Antelma: compila il modulo per ricevere assistenza e ' +
      'informazioni sui servizi offerti dal gruppo.',
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

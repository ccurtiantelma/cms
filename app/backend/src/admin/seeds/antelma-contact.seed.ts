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

/** Slug pubblico della pagina, unico per `locale` fra le pagine root attive. */
const PAGE_SLUG = 'contatti-antelma';
const PAGE_TITLE = 'Antelma - Richiedi un Contatto';

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
 * ADR-31 § layout a colonne di `section`, ADR-39 § `container` flex a nesting
 * ricorsivo, ADR-46 § form dinamici). Solo prop realmente dichiarate dal
 * registro di produzione (`blocks/block-registry.ts`): niente `style` libero,
 * niente `h1` (riservato al template del consumer HTML), niente prop inventate
 * — ADR-21 § 4 tratta un `kind` aggiuntivo come nuovo schema di blocco, non
 * qualcosa che si introduce in un seed.
 *
 * Adattamenti dichiarati rispetto al brief grafico originale (nessun
 * equivalente nel registro attuale, quindi omessi anziché inventati):
 * - `Heading.level` è `h2`, mai `h1` (registro `heading.block.ts`).
 * - Nessun `background-image`/gradiente sull'Hero: `section` espone solo
 *   `styleBackgroundColor` (colore esadecimale piatto), non un layer immagine.
 * - Spaziature in pixel del brief proiettate sul token più vicino fra
 *   `stylePaddingTop/Right/Bottom/Left` (`'0'..'96'`), non un valore libero.
 * - `Heading` non ha una prop di allineamento testo: il centraggio del titolo
 *   Hero non è rappresentabile nel registro attuale.
 * - `container` non ha `columns`/`maxWidth`: il vincolo di larghezza del form
 *   (760px, centrato) è espresso da `section.maxWidth`/`contentWidth`, non dal
 *   `container` che lo racchiude (che resta comunque presente, come da brief).
 * - `form` ha solo `formKey` (niente `formTitle`); `form-submit` ha solo
 *   `label` (nessuna prop di stile).
 *
 * Nessun header/footer qui: sono cromatura di layout, non contenuto di
 * Pagina (ADR-40) — vive nelle Sezioni Globali `header`/`footer`
 * (`antelma-global-sections.seed.ts`), renderizzate da `PageView` attorno a
 * questo albero. Un footer duplicato dentro la Pagina è stato rimosso da qui
 * per questo motivo (era il doppio footer visibile sulla pagina pubblicata).
 */
function buildAntelmaContactBlocks(): BlockNode[] {
  const heroSection: BlockNode = {
    id: 'antelma-contatti-hero-section',
    type: 'section',
    v: 1,
    props: {
      styleBackgroundColor: '#0f172a',
      stylePaddingTop: { default: '96' },
      stylePaddingBottom: { default: '96' },
      stylePaddingLeft: { default: '24' },
      stylePaddingRight: { default: '24' },
      contentWidth: 'boxed',
      columns: { default: '1' },
    },
    children: [
      {
        id: 'antelma-contatti-hero-heading',
        type: 'heading',
        v: 1,
        props: {
          level: 'h2',
          text: 'RICHIEDI UN CONTATTO ANTELMA',
          styleTextColorCustom: '#ffffff',
          styleFontSizeCustom: { value: 36, unit: 'px' },
          styleFontWeight: { default: 'bold' },
        },
        children: [],
      },
    ],
  };

  const formSection: BlockNode = {
    id: 'antelma-contatti-form-section',
    type: 'section',
    v: 1,
    props: {
      styleBackgroundColor: '#ffffff',
      stylePaddingTop: { default: '64' },
      stylePaddingBottom: { default: '64' },
      stylePaddingLeft: { default: '24' },
      stylePaddingRight: { default: '24' },
      contentWidth: 'boxed',
      maxWidth: 'md',
      columns: { default: '1' },
    },
    children: [
      {
        id: 'antelma-contatti-form-container',
        type: 'container',
        v: 1,
        props: {
          flexDirection: { default: 'column' },
          gap: { default: 'md' },
        },
        children: [
          {
            id: 'antelma-contatti-form',
            type: 'form',
            v: 1,
            props: { formKey: 'antelma-contact' },
            children: [
              {
                id: 'antelma-contatti-form-field-cognome',
                type: 'form-field',
                v: 1,
                props: {
                  fieldType: 'text',
                  name: 'cognome',
                  label: 'COGNOME',
                  placeholder: 'Cognome',
                  required: true,
                },
                children: [],
              },
              {
                id: 'antelma-contatti-form-field-email',
                type: 'form-field',
                v: 1,
                props: {
                  fieldType: 'email',
                  name: 'email',
                  label: 'EMAIL',
                  placeholder: 'Email',
                  required: true,
                },
                children: [],
              },
              {
                id: 'antelma-contatti-form-submit',
                type: 'form-submit',
                v: 1,
                props: { label: 'INVIA RICHIESTA' },
                children: [],
              },
            ],
          },
          // `form.children.allow` è chiuso a `form-field`/`form-submit` (form.block.ts):
          // il testo di consenso non può vivere dentro il nodo `form`, quindi è un
          // fratello del `form` dentro il `container`, subito dopo (stesso ordine
          // visivo del brief: campi → invio → nota di consenso).
          {
            id: 'antelma-contatti-form-consent',
            type: 'richText',
            v: 1,
            props: {
              html:
                '<p>Prestazione del consenso ai sensi del Regolamento UE per ricevere ' +
                'assistenza e informazioni sui servizi offerti dal titolare.</p>',
              styleFontSize: { default: 'sm' },
              styleTextColorCustom: '#6b7280',
            },
            children: [],
          },
        ],
      },
    ],
  };

  return [heroSection, formSection];
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

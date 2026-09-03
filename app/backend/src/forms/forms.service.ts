import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  appSettingEntity,
  formSubmissionEntity,
  pageEntity,
  pageRevisionEntity,
} from '../db/schema';
import { Utils } from '../common/utils';
import { Pagination } from '../common/pagination';
import { FormSubmissionsQueryParams } from '../common/types';
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../blocks/block-registry';
import { BlockTreeValidatorService } from '../blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import { EmailQueueService } from '../queues/email-queue/email.queue.service';
import { computeVisitorHash } from '../analytics/visitor-hash.util';
import { computeFormHoneypotFieldName, computeFormSignature } from './form-antispam.util';
import { SubmitFormDto } from './dto/submit-form.dto';
import { FormSubmissionDto } from './dto/form-submission.dto';

type FormSubmissionRow = typeof formSubmissionEntity.$inferSelect;
type FormSubmissionRowWithPage = FormSubmissionRow & { page: { guid: string } };

/** Esito della ricerca del blocco `form` pubblicato per `formKey` (ADR-46 § 4). */
interface PublishedFormMatch {
  pageId: number;
  formNode: ValidatableBlockNode;
}

/** Configurazione operativa letta da `app_settings` chiave `form:<formKey>:settings` (RFC-46 D2). */
interface FormOperationalSettings {
  recipients: string[];
  notifySubject: string;
}

/** Violazione di un singolo campo, riportata in `details` di un `400` (RFC-46 D4.3). */
interface FieldViolation {
  name: string;
  reason: 'missing' | 'unexpected' | 'invalidValue';
}

/**
 * Elaborazione degli Invii dei Form (F10-02, ADR-46). Due superfici:
 * `submitForm` (pubblica, anonima, D4/D6) e `listSubmissions` (amministrativa,
 * Manager+, guard sul controller).
 *
 * La risoluzione del blocco `form` pubblicato riusa **la stessa pipeline**
 * migrazione→validazione di `PublicPagesService` (funzioni esportate di
 * `blocks/migration/*`/`BlockTreeValidatorService`), mai un parser jsonb
 * parallelo (ADR-46 § 4, RFC-46 D4.3) — orchestrata di nuovo qui, in forma
 * tollerante (una Pagina con albero non migrabile/non valido viene
 * silenziosamente saltata, non fa fallire l'intera ricerca), perché
 * `PublicPagesService` non espone questo passaggio come metodo pubblico
 * riusabile per un `formKey` invece che per un `path`.
 */
@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  /** Inietta accesso al DB, coda email, e la coppia validator/registro blocchi (mai `DEFAULT_BLOCK_REGISTRY` fisso, stesso motivo di `PagesService`). */
  constructor(
    private readonly db: DbService,
    private readonly emailQueueService: EmailQueueService,
    private readonly blockTreeValidator: BlockTreeValidatorService,
    @Inject(BLOCK_REGISTRY_TOKEN) private readonly blockRegistry: BlockRegistry,
  ) {}

  /**
   * Elabora una sottomissione pubblica (ADR-46 § 4, ordine handler vincolante):
   * 1) honeypot dal body grezzo, 2) firma HMAC, 3) risoluzione del blocco
   * `form` fra le Pagine `published`, 4) validazione dei valori contro i
   * `form-field` realmente pubblicati, 5) persistenza dell'Invio, 6) notifica
   * via `email-queue` con i destinatari letti **solo** da `app_settings`.
   * I punti 1 e 2 falliscono in silenzio (`200` generico dal controller,
   * nessuna eccezione: RFC-46 D6, "pubblico non rivela il meccanismo"). Il
   * punto 4 fallisce con `400` esplicito: non è un segnale anti-spam, è un
   * errore legittimo di integrazione client contro la composizione
   * realmente pubblicata.
   * @param formKey `:formId` dell'URL (RFC-46 D4: `formId` **è** `formKey`).
   * @param dto Corpo tipizzato (`signature`/`values`), costruito dal
   * controller a partire dal body grezzo — non validato dalla `ValidationPipe`
   * globale (vedi JSDoc di `SubmitFormDto`).
   * @param rawBody Body grezzo della richiesta, unica fonte per il campo
   * honeypot (nome dinamico, non dichiarabile nella DTO).
   */
  async submitForm(
    formKey: string,
    dto: SubmitFormDto,
    rawBody: Record<string, unknown>,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const honeypotName = computeFormHoneypotFieldName(formKey);
    const honeypotValue = rawBody[honeypotName];
    if (typeof honeypotValue === 'string' && honeypotValue.trim() !== '') {
      this.logger.warn(`Submit scartato (honeypot valorizzato, formKey=${formKey}).`);
      return;
    }

    const expectedSignature = computeFormSignature(formKey);
    if (typeof dto.signature !== 'string' || dto.signature !== expectedSignature) {
      this.logger.warn(`Submit scartato (firma HMAC non valida, formKey=${formKey}).`);
      return;
    }

    const match = await this.resolvePublishedForm(formKey);
    if (!match) {
      throw new NotFoundException();
    }

    const fieldNodes = match.formNode.children.filter((child) => child.type === 'form-field');
    const values = this.isPlainObject(dto.values) ? dto.values : {};
    const violations = this.validateValuesAgainstFields(values, fieldNodes);
    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'I valori sottomessi non corrispondono ai campi pubblicati per questo modulo.',
        code: 'FORM_SUBMISSION_INVALID',
        details: { fields: violations },
      });
    }

    const ipHash = computeVisitorHash(ip, userAgent);
    const [row] = await this.db.db
      .insert(formSubmissionEntity)
      .values({
        guid: Utils.randomString(16),
        formKey,
        pageId: match.pageId,
        payload: values,
        ipHash,
        userAgent: userAgent ? userAgent.slice(0, 500) : null,
      })
      .returning();

    this.logger.log(`Invio persistito (formKey=${formKey}, guid=${row.guid}).`);

    // La notifica è sempre successiva alla persistenza (business-rules.md §
    // Moduli di contatto, punto 3): un `app_settings` assente o senza
    // `recipients` non fa mai fallire l'operazione già riuscita.
    const settings = await this.loadOperationalSettings(formKey);
    if (!settings || settings.recipients.length === 0) {
      this.logger.warn(
        `Nessuna configurazione "form:${formKey}:settings" con destinatari: Invio salvato (guid=${row.guid}) senza notifica.`,
      );
      return;
    }

    const [to, ...cc] = settings.recipients;
    await this.emailQueueService.enqueueEmail({
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject: settings.notifySubject,
      html: this.renderNotificationHtml(formKey, values),
    });
  }

  /**
   * Lista paginata degli Invii attivi (amministrativa, Manager+, guard sul
   * controller — nessuna ownership per riga: gli Invii non hanno un autore
   * utente, sono una sottomissione pubblica anonima). Stesso pattern di
   * paginazione di `PagesService.findAll`.
   */
  async listSubmissions(
    params: FormSubmissionsQueryParams,
  ): Promise<Pagination<FormSubmissionDto>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [eq(formSubmissionEntity.isActive, true)];
    if (params.formKey) {
      conditions.push(eq(formSubmissionEntity.formKey, params.formKey));
    }
    const where = and(...conditions);
    const orderBy =
      params.d === 'asc'
        ? asc(formSubmissionEntity.createdAt)
        : desc(formSubmissionEntity.createdAt);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.formSubmissionEntity.findMany({
        where,
        orderBy,
        limit: perPage,
        offset: (page - 1) * perPage,
        with: { page: { columns: { guid: true } } },
      }),
      this.db.db.select({ total: count() }).from(formSubmissionEntity).where(where),
    ]);

    return new Pagination(
      (rows as FormSubmissionRowWithPage[]).map((row) => this.toDto(row)),
      total,
      page,
      perPage,
    );
  }

  /** Mappa la riga (con relazione `page` caricata) al DTO amministrativo. */
  private toDto(row: FormSubmissionRowWithPage): FormSubmissionDto {
    return {
      guid: row.guid,
      formKey: row.formKey,
      pageGuid: row.page.guid,
      payload: row.payload as Record<string, unknown>,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      isActive: row.isActive,
    };
  }

  /**
   * Cerca fra le Pagine `published` un blocco `form` con questo `formKey`
   * (RFC-46 D4.2). Un `formKey` duplicato su più Pagine è ammesso (RFC-46
   * D2): questa implementazione ritorna il **primo** match trovato — la
   * stessa configurazione `app_settings` si applica comunque a ogni blocco
   * con quel `formKey`, quindi la scelta della Pagina "vincitrice" incide
   * solo su quale `pageId` viene registrato sull'Invio, non sull'esito
   * dell'invio stesso. Scansione lineare delle Pagine pubblicate: un indice
   * dedicato ricalcolato a ogni pubblicazione è un'ottimizzazione dichiarata
   * fuori scope da RFC-46 § D4.2 ("dettaglio di implementazione per il
   * piano").
   */
  private async resolvePublishedForm(formKey: string): Promise<PublishedFormMatch | undefined> {
    const pages = await this.db.db.query.pageEntity.findMany({
      where: and(eq(pageEntity.status, 'published'), eq(pageEntity.isActive, true)),
    });

    for (const page of pages) {
      if (page.publishedRevisionId === null) {
        continue;
      }
      const revision = await this.db.db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.id, page.publishedRevisionId),
      });
      if (!revision) {
        continue;
      }

      const tree = this.migrateAndValidateTolerant(revision.content, page.guid);
      if (!tree) {
        continue;
      }

      const formNode = this.findFormNode(tree, formKey);
      if (formNode) {
        return { pageId: page.id, formNode };
      }
    }

    return undefined;
  }

  /**
   * Migrazione + validazione in lettura, forma **tollerante** (mai
   * un'eccezione): una Pagina con envelope/albero non migrabile o non valido
   * viene solo loggata e saltata dalla ricerca, stessa logica di
   * `PublicPagesService.migrateAndValidateOrThrow` ma senza `404` (qui si
   * scansionano N Pagine, una sola non deve interrompere le altre).
   */
  private migrateAndValidateTolerant(
    rawContent: unknown,
    pageGuid: string,
  ): ValidatableBlockNode[] | undefined {
    const envelope =
      rawContent !== null && typeof rawContent === 'object' && !Array.isArray(rawContent)
        ? (rawContent as Record<string, unknown>)
        : { version: ENVELOPE_VERSION, blocks: [] };
    const fromVersion = typeof envelope.version === 'number' ? envelope.version : 1;

    const envelopeOutcome = migrateEnvelope(envelope, fromVersion);
    if (envelopeOutcome.unsupported) {
      this.logger.warn(
        `Pagina guid=${pageGuid}: envelope non migrabile, saltata dalla ricerca form.`,
      );
      return undefined;
    }

    const blocksInput = Array.isArray(envelopeOutcome.envelope.blocks)
      ? (envelopeOutcome.envelope.blocks as MigratableBlockNode[])
      : [];
    const migration = migrateBlockTree(blocksInput, this.blockRegistry);
    if (migration.errors.length > 0) {
      this.logger.warn(
        `Pagina guid=${pageGuid}: albero non migrabile, saltata dalla ricerca form.`,
      );
      return undefined;
    }

    const validation = this.blockTreeValidator.validateTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
    );
    if (!validation.valid) {
      this.logger.warn(`Pagina guid=${pageGuid}: albero non valido, saltata dalla ricerca form.`);
      return undefined;
    }

    return migration.blocks as ValidatableBlockNode[];
  }

  /** Ricerca ricorsiva del primo nodo `type: 'form'` con `props.formKey` corrispondente. */
  private findFormNode(
    nodes: ValidatableBlockNode[],
    formKey: string,
  ): ValidatableBlockNode | undefined {
    for (const node of nodes) {
      if (node.type === 'form' && node.props.formKey === formKey) {
        return node;
      }
      const found = this.findFormNode(node.children, formKey);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Verifica che `values` contenga esattamente i `name` attesi dai
   * `form-field` realmente pubblicati, con `required` rispettato e i valori
   * `select`/`checkbox` ammessi (RFC-46 D4.3). `options` è una stringa CSV
   * (nessun `kind` array nel registro, vedi `form-field.block.ts`).
   */
  private validateValuesAgainstFields(
    values: Record<string, unknown>,
    fieldNodes: ValidatableBlockNode[],
  ): FieldViolation[] {
    const violations: FieldViolation[] = [];
    const expectedNames = new Set<string>();

    for (const field of fieldNodes) {
      const name = String(field.props.name);
      expectedNames.add(name);
      const required = field.props.required === true;
      const fieldType = field.props.fieldType;
      const value = values[name];
      const isEmpty = value === undefined || value === null || value === '';

      if (required && isEmpty) {
        violations.push({ name, reason: 'missing' });
        continue;
      }
      if (isEmpty) {
        continue;
      }

      if (fieldType === 'select') {
        const options = typeof field.props.options === 'string' ? field.props.options : '';
        const allowed = options
          .split(',')
          .map((option) => option.trim())
          .filter((option) => option.length > 0);
        if (allowed.length > 0 && !allowed.includes(String(value))) {
          violations.push({ name, reason: 'invalidValue' });
        }
      } else if (fieldType === 'checkbox' && typeof value !== 'boolean') {
        violations.push({ name, reason: 'invalidValue' });
      }
    }

    for (const providedName of Object.keys(values)) {
      if (!expectedNames.has(providedName)) {
        violations.push({ name: providedName, reason: 'unexpected' });
      }
    }

    return violations;
  }

  /** Legge la configurazione operativa `form:<formKey>:settings` da `app_settings` (RFC-46 D2). */
  private async loadOperationalSettings(
    formKey: string,
  ): Promise<FormOperationalSettings | undefined> {
    const row = await this.db.db.query.appSettingEntity.findFirst({
      where: and(
        eq(appSettingEntity.key, `form:${formKey}:settings`),
        eq(appSettingEntity.isActive, true),
      ),
    });
    if (!row) {
      return undefined;
    }
    const value = row.value as Partial<FormOperationalSettings> | null;
    const recipients = Array.isArray(value?.recipients) ? value!.recipients : [];
    const notifySubject =
      typeof value?.notifySubject === 'string' ? value!.notifySubject : `Nuovo Invio: ${formKey}`;
    return { recipients, notifySubject };
  }

  /**
   * Template minimo campo→valore: i valori sono interpolati come **testo**,
   * mai come HTML (stesso principio `plainText` di ADR-21 § 4 applicato al
   * renderer email, RFC-46 D8) — nessun markup arbitrario dal payload.
   */
  private renderNotificationHtml(formKey: string, values: Record<string, unknown>): string {
    const rows = Object.entries(values)
      .map(
        ([key, value]) =>
          `<tr><td>${this.escapeHtml(key)}</td><td>${this.escapeHtml(String(value))}</td></tr>`,
      )
      .join('');
    return `<p>Nuovo Invio per il modulo "${this.escapeHtml(formKey)}":</p><table>${rows}</table>`;
  }

  /** Escaping minimo per l'interpolazione testuale nel template email (mai HTML dal payload). */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Type guard: `unknown` proveniente dalla DTO manuale è davvero un oggetto piano. */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { siteTemplateEntity } from '../db/schema';
import {
  DisplayConditionTarget,
  DisplayConditionType,
  RESOLVABLE_SITE_TEMPLATE_TYPES,
  SiteTemplateType,
} from '../common/enums';
import { SiteTemplateResponseDto } from './dto/site-template.dto';
import { DisplayConditionRuleDto } from './dto/display-condition-rule.dto';

type SiteTemplateRow = typeof siteTemplateEntity.$inferSelect;

/**
 * Risolve quale Template di tema pubblicato si applica a una rotta pubblica
 * (consumer SSR, ADR-22). Riceve solo `path`/`type`/`lang`: nessuna
 * dipendenza da `PagesModule`, coerente con l'assenza di un punto di
 * risoluzione Pagina→Template in ADR-24 — ogni regola di visualizzazione
 * opera esclusivamente sul `path`, mai su un guid di Pagina dereferenziato
 * altrove.
 */
@Injectable()
export class TemplateResolverService {
  private readonly logger = new Logger(TemplateResolverService.name);

  /** Inietta il servizio DB usato per interrogare `site_templates`. */
  constructor(private readonly db: DbService) {}

  /**
   * Candidati pubblicati per `type`+`lang`, ordinati per `priority`
   * decrescente; il primo le cui `displayConditions` verificano `path`
   * vince. `type` fuori da {@link RESOLVABLE_SITE_TEMPLATE_TYPES}
   * (`single_post`/`archive`, RFC-40 § 3) non ha semantica di risoluzione:
   * nessuna query, `null` immediato.
   */
  async resolveForRoute(
    path: string,
    type: SiteTemplateType,
    lang: string,
  ): Promise<SiteTemplateResponseDto | null> {
    if (!RESOLVABLE_SITE_TEMPLATE_TYPES.has(type)) {
      this.logger.debug(
        `Tipo "${type}" senza semantica di risoluzione (RFC-40 § 3): nessun Template risolto.`,
      );
      return null;
    }

    const candidates = await this.db.db.query.siteTemplateEntity.findMany({
      where: and(
        eq(siteTemplateEntity.isActive, true),
        eq(siteTemplateEntity.isPublished, true),
        eq(siteTemplateEntity.type, type),
        eq(siteTemplateEntity.language, lang),
      ),
      orderBy: desc(siteTemplateEntity.priority),
    });

    const winner = candidates.find((row) => this.matchesDisplayConditions(row, path));
    return winner ? this.toDto(winner) : null;
  }

  /**
   * Nessuna regola ⇒ il Template si applica a ogni rotta del suo tipo/lingua.
   * Un `exclude` che verifica il `path` esclude sempre. Con almeno un
   * `include`, serve che almeno uno verifichi il `path` (allowlist);
   * altrimenti il Template resta aperto a ogni rotta non esclusa.
   */
  private matchesDisplayConditions(row: SiteTemplateRow, path: string): boolean {
    const rules = (row.displayConditions ?? []) as DisplayConditionRuleDto[];
    if (rules.length === 0) return true;

    const includes = rules.filter((r) => r.type === DisplayConditionType.Include);
    const excludes = rules.filter((r) => r.type === DisplayConditionType.Exclude);

    if (excludes.some((rule) => this.ruleTargetsPath(rule, path))) {
      return false;
    }
    if (includes.length === 0) {
      return true;
    }
    return includes.some((rule) => this.ruleTargetsPath(rule, path));
  }

  private ruleTargetsPath(rule: DisplayConditionRuleDto, path: string): boolean {
    switch (rule.target) {
      case DisplayConditionTarget.EntireSite:
        return true;
      case DisplayConditionTarget.SpecificPage:
        return rule.value === path;
      case DisplayConditionTarget.PathPattern:
        return rule.value !== undefined && this.matchesPattern(rule.value, path);
      default:
        return false;
    }
  }

  /** `*` come unico wildcard supportato; ogni altro carattere speciale di regex è escapato. */
  private matchesPattern(pattern: string, path: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(path);
  }

  private toDto(row: SiteTemplateRow): SiteTemplateResponseDto {
    return {
      guid: row.guid,
      title: row.title,
      type: row.type as SiteTemplateType,
      contentTree: row.contentTree as Record<string, unknown>,
      isPublished: row.isPublished,
      language: row.language,
      priority: row.priority,
      displayConditions: (row.displayConditions ?? []) as DisplayConditionRuleDto[],
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

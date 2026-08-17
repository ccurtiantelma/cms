import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sanitizeHtml from 'sanitize-html';
import { F01_SANITIZE_OPTIONS } from './sanitizer.config';

/**
 * Sanitizza ricorsivamente l'albero di blocchi (F01, ADR-20): ogni prop di
 * tipo stringa, a qualunque profondità e sotto qualunque `type`, passa da
 * `sanitize-html` con l'allowlist minima di F01 prima della persistenza —
 * non "il blocco richText": F01 non conosce i tipi di blocco, quindi tratta
 * ogni stringa come ostile. La struttura dell'albero (chiavi, `id`, `type`,
 * `children`) non è mai toccata: si sanitizzano i valori, non la forma.
 *
 * **Limite noto e accettato**: `sanitize-html` tratta ogni stringa come HTML
 * potenziale e quindi HTML-escapa `< > &` anche in prop che non sono HTML
 * (label, alt, title...), es. `"5 < 10"` → `"5 &lt; 10"`. F01 non può evitarlo:
 * non sa distinguere una prop HTML da una prop di testo semplice, perché la
 * distinzione è un contratto di dominio che arriva con il registro dei
 * blocchi di F02 (allowlist per tipo di blocco). Il limite si chiude lì, non
 * qui — nessuna euristica che indovini se una stringa "sembra markup" va
 * introdotta in un percorso di sicurezza. Vedi test di regressione dedicato.
 */
@Injectable()
export class TreeSanitizerService {
  private readonly logger = new Logger(TreeSanitizerService.name);

  /**
   * Ritorna una copia sanitizzata dell'albero. Un errore durante la
   * sanitizzazione di un qualunque valore respinge l'intero albero — mai
   * persistenza parziale — con `400 CONTENT_SANITIZATION_FAILED`.
   */
  sanitizeTree<T>(tree: T): T {
    try {
      return this.walk(tree) as T;
    } catch (err) {
      this.logger.warn(`Albero non sanitizzabile: ${(err as Error).message}`);
      throw new BadRequestException({
        message: 'Contenuto non sanitizzabile.',
        code: 'CONTENT_SANITIZATION_FAILED',
      });
    }
  }

  private walk(value: unknown): unknown {
    if (typeof value === 'string') {
      return sanitizeHtml(value, F01_SANITIZE_OPTIONS);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.walk(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = this.walk(item);
      }
      return result;
    }
    return value;
  }
}

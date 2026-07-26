import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { captureException } from '../observability/sentry.util';

/** Forma del body restituito da `HttpException.getResponse()` quando è un oggetto (non una stringa). */
interface HttpExceptionResponseBody {
  message?: string | string[];
  code?: string;
}

/**
 * Filtro globale eccezioni (CLAUDE.md, Error Handling Policy): normalizza OGNI
 * errore nel formato uniforme `{ statusCode, message, code, timestamp, path }`.
 * Gli errori 5xx sono loggati a livello `error` (stack incluso), i 4xx a `warn`;
 * lo stack trace non viene mai esposto nella risposta HTTP.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** Normalizza ogni eccezione (nota o non) in una risposta HTTP uniforme. */
  catch(exception: unknown, host: ArgumentsHost): void {
    // Contesti non-HTTP (es. job BullMQ, gateway websocket): nessuna response da comporre.
    if (host.getType() !== 'http') {
      const message = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        `Eccezione non-HTTP non gestita: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Risposta già inviata (es. stream o handler che ha già scritto direttamente su @Res()): non toccarla.
    if (response.headersSent) {
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const responseBody =
      typeof message === 'object' ? (message as HttpExceptionResponseBody) : undefined;

    const code =
      exception instanceof HttpException ? responseBody?.code || exception.name : 'UNKNOWN_ERROR';

    const errorResponse = {
      statusCode: status,
      message: responseBody?.message || message,
      code,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method} ${request.url}]`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
      // Solo i 5xx (ADR-15): mai i 4xx, per non affogare Sentry in rumore da validazione/auth.
      captureException(exception);
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(
        `[${request.method} ${request.url}] ${JSON.stringify(errorResponse.message)}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}

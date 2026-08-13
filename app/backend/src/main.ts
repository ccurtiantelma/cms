import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConstants } from './common/app-constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { WinstonLoggerService } from './common/logging/winston-logger.service';
import { initSentry } from './common/observability/sentry.util';

/** Bootstrap dell'applicazione NestJS. */
async function bootstrap(): Promise<void> {
  // Va chiamato prima di creare l'app Nest (ADR-15): no-op se `SENTRY_ENABLED=false` (default).
  initSentry();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new WinstonLoggerService());

  // `metrics` escluso dal prefisso globale (ADR-15): convenzione Prometheus,
  // path pubblico `/metrics` invece di `/api/v1/metrics`. Esclusione innocua
  // se `MetricsModule` non è registrato (METRICS_ENABLED=false, default).
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });

  app.enableCors({
    origin: AppConstants.frontendUrl,
    credentials: true,
  });

  if (AppConstants.isProduction) {
    const helmet = await import('helmet');
    app.use(helmet.default());
  }

  // Swagger — solo fuori produzione.
  if (!AppConstants.isProduction) {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('CMS API')
      .setDescription(
        'API REST del boilerplate aziendale (auth, RBAC, MFA, audit log, gestione utenti).',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, config));
  }

  // forbidNonWhitelisted: rifiuta con 400 i payload con campi non dichiarati nei DTO,
  // invece di scartarli in silenzio (whitelist da solo). Fa emergere richieste malformate/malevole.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(compression());
  app.use(cookieParser(AppConstants.cookieSecret));

  await app.listen(AppConstants.port);
  new Logger('Bootstrap').log(
    `Applicazione avviata su http://localhost:${AppConstants.port}/api/v1`,
  );
}

bootstrap();

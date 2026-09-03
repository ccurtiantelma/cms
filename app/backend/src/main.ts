import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { AppConstants } from './common/app-constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { WinstonLoggerService } from './common/logging/winston-logger.service';
import { initSentry } from './common/observability/sentry.util';

/** Bootstrap dell'applicazione NestJS. */
async function bootstrap(): Promise<void> {
  // Va chiamato prima di creare l'app Nest (ADR-15): no-op se `SENTRY_ENABLED=false` (default).
  initSentry();

  // `bodyParser: false`: il body parser di default va disabilitato per poter
  // applicare un limite diverso sulla sola superficie amministrativa
  // (A-F02-1, sotto) invece di alzarlo globalmente — a F03 nasce un endpoint
  // pubblico anonimo che non deve ereditare 1 MiB.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(new WinstonLoggerService());

  // `metrics` escluso dal prefisso globale (ADR-15): convenzione Prometheus,
  // path pubblico `/metrics` invece di `/api/v1/metrics`. Esclusione innocua
  // se `MetricsModule` non è registrato (METRICS_ENABLED=false, default).
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });

  // In sviluppo locale il frontend può girare su un'altra porta `localhost`
  // (es. 55173/55174), quindi non si limita più a un solo host: accettiamo
  // tutte le origini di sviluppo `localhost`/`127.0.0.1` e manteniamo le
  // origini dichiarate per i runtime non locali. Questo evita il blocco CORS
  // sul login admin senza aprire un wildcard globale in produzione.
  const allowedOrigins = [AppConstants.frontendUrl, AppConstants.publicSiteUrl];
  const isLocalDevOrigin = (origin: string | undefined): boolean =>
    !!origin && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
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

  // A-F02-1 (SPEC-F02-blocchi.md § Vincoli, punto 3): un envelope di blocchi
  // legittimo (fino a 512 KiB + metadati SEO + overhead JSON) supera il
  // default Express (100 KB). Il limite di 1 MiB vale solo per `api/v1/app/*`
  // (superficie amministrativa): montato per path, non globalmente, così un
  // futuro endpoint pubblico anonimo (F03, `api/v1/public/*`) resta al
  // default più stretto. `body-parser` salta il ri-parsing se il body è già
  // stato letto da un middleware precedente, quindi il secondo `json()`
  // generico qui sotto è un no-op per le richieste già gestite dal primo.
  app.use('/api/v1/app', json({ limit: '1mb' }));
  app.use(json());

  await app.listen(AppConstants.port);
  new Logger('Bootstrap').log(
    `Applicazione avviata su http://localhost:${AppConstants.port}/api/v1`,
  );
}

bootstrap();

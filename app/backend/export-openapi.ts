/**
 * export-openapi.ts
 * Genera docs/openapi.yaml dal progetto NestJS senza avviare il server HTTP.
 * Lanciare dalla root del backend con: npm run openapi:export
 */

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'js-yaml';
import { AppModule } from './src/app.module';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('CMS API')
    .setDescription(
      'API REST del boilerplate aziendale (auth, RBAC, MFA, audit log, gestione utenti).',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = resolve(__dirname, '../../docs/openapi.yaml');
  writeFileSync(outputPath, yaml.dump(document, { noRefs: true }));

  console.log(`openapi.yaml generato in: ${outputPath}`);
  await app.close();
  // Connessioni residue (pool DB, client Redis) impedirebbero altrimenti l'uscita del processo.
  process.exit(0);
}

exportOpenApi();

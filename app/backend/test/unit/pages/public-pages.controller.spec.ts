import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import { PublicPagesController } from '../../../src/pages/public-pages.controller';
import { PublicPagesService } from '../../../src/pages/public-pages.service';
import { DEFAULT_THEME_CONFIG, SettingsService } from '../../../src/settings/settings.service';

describe('PublicPagesController (unit)', () => {
  let app: INestApplication;
  let getThemeConfig: jest.Mock;

  const theme = structuredClone(DEFAULT_THEME_CONFIG);

  beforeAll(async () => {
    getThemeConfig = jest.fn().mockResolvedValue(theme);
    const settingsService = { getThemeConfig } as unknown as SettingsService;
    const publicPagesService = {} as PublicPagesService;
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PublicPagesController],
      providers: [
        { provide: PublicPagesService, useValue: publicPagesService },
        { provide: SettingsService, useValue: settingsService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('risponde 200 con la configurazione del tema senza autenticazione', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/settings/theme')
      .expect(200);

    expect(response.body).toEqual(theme);
    expect(getThemeConfig).toHaveBeenCalledTimes(1);
  });
});
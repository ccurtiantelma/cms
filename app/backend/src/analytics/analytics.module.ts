import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PagesModule } from '../pages/pages.module';

/** Modulo per raccolta anonima delle pageview SSR e KPI amministrativi. */
@Module({
  imports: [PagesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}

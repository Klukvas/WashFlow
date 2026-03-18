import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsExportService } from './analytics-export.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository, AnalyticsExportService],
})
export class AnalyticsModule {}

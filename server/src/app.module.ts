import { DynamicModule, ExecutionContext, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { APP_CONFIG, AppConfig, ConfigModule } from './config/app-config';
import { AskController } from './modules/ask/ask.controller';
import { AskService } from './modules/ask/ask.service';
import { ExtractiveLlmService, LlmService } from './modules/ask/llm.service';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CurrenciesController } from './modules/currencies/currencies.controller';
import { FeedbackController, FeedbackStore } from './modules/feedback/feedback.controller';
import { HealthController } from './modules/health/health.controller';
import { ManifestController } from './modules/manifest/manifest.controller';
import { ScanController } from './modules/scan/scan.controller';

const MINUTE = 60_000;

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        CatalogModule,
        ThrottlerModule.forRootAsync({
          inject: [APP_CONFIG],
          useFactory: (c: AppConfig) => ({
            throttlers: [
              // Every endpoint.
              { name: 'default', ttl: MINUTE, limit: c.rateLimitPerMinute },
              // /v1/ask only: answers cost more than lookups.
              {
                name: 'ask',
                ttl: MINUTE,
                limit: c.askRateLimitPerMinute,
                skipIf: (ctx: ExecutionContext) =>
                  !ctx.switchToHttp().getRequest<{ url: string }>().url.startsWith('/v1/ask'),
              },
            ],
          }),
        }),
      ],
      controllers: [
        HealthController,
        ManifestController,
        CurrenciesController,
        ScanController,
        AskController,
        FeedbackController,
      ],
      providers: [
        AskService,
        FeedbackStore,
        { provide: LlmService, useClass: ExtractiveLlmService },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    };
  }
}

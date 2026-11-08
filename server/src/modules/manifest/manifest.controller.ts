import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { compareVersions } from '../../common/semver';
import { ApiCommonErrors, ApiErrorResponses } from '../../common/swagger/api-errors.decorator';
import { CatalogRepository } from '../catalog/catalog.repository';

/** Oldest app version this server still supports. Raise it to force updates. */
export const MIN_APP_VERSION = '0.1.0';

export class ManifestQuery {
  @ApiPropertyOptional({
    description: 'Which app is asking. Reserved for platform-specific downloads later.',
    enum: ['android', 'ios'],
    example: 'android',
  })
  @IsOptional()
  @IsIn(['android', 'ios'], { message: 'platform must be android or ios' })
  platform?: 'android' | 'ios';

  @ApiPropertyOptional({
    description:
      'The app\'s own version as `major.minor.patch`. If it is older than `minAppVersion` the server answers 426 `APP_UPDATE_REQUIRED`.',
    example: '0.1.0',
    pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$',
  })
  @IsOptional()
  @Matches(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, {
    message: 'appVersion must look like 1.2.3',
  })
  appVersion?: string;
}

export class DataPackInfo {
  @ApiProperty({
    description: 'Version of the whole data set. Changes whenever any currency or fact changes.',
    example: '2026.11.08-1',
  })
  version!: string;

  @ApiProperty({
    description: 'When this version of the data was published, UTC.',
    format: 'date-time',
    example: '2026-11-08T00:00:00.000Z',
  })
  publishedAt!: string;

  @ApiProperty({ description: 'Number of currencies in the data set.', example: 4 })
  currencies!: number;
}

export class ManifestResponse {
  @ApiProperty({ type: DataPackInfo })
  dataPack!: DataPackInfo;

  @ApiProperty({
    description: 'Oldest app version this server supports.',
    example: MIN_APP_VERSION,
  })
  minAppVersion!: string;

  @ApiProperty({
    description:
      'Downloadable on-device models. Empty for now: no model is published yet.',
    type: [String],
    example: [],
  })
  models!: string[];

  @ApiProperty({ description: 'Server clock, UTC.', format: 'date-time', example: '2026-11-08T10:15:30.000Z' })
  serverTime!: string;
}

@ApiTags('Manifest')
@ApiCommonErrors()
@Controller('manifest')
export class ManifestController {
  constructor(private readonly catalog: CatalogRepository) {}

  @Get()
  @ApiOperation({
    operationId: 'getManifest',
    summary: 'What is the newest data, and may this app version use it?',
    description:
      'The app calls this on launch and then about once a day. It answers two questions:\n\n' +
      '1. **Is there newer data?** Compare `dataPack.version` with the version the app already holds.\n' +
      '2. **Is this app still supported?** Send `appVersion`; if it is older than `minAppVersion` the answer is 426.\n\n' +
      'The response may be cached for a minute (`Cache-Control: public, max-age=60`).',
  })
  @ApiOkResponse({ type: ManifestResponse, description: 'The current manifest.' })
  @ApiErrorResponses(
    '/v1/manifest',
    ErrorCode.VALIDATION_FAILED,
    {
      code: ErrorCode.APP_UPDATE_REQUIRED,
      path: '/v1/manifest',
      message: `App version 0.0.9 is older than the minimum ${MIN_APP_VERSION}.`,
    },
  )
  async getManifest(
    @Query() query: ManifestQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ManifestResponse> {
    if (query.appVersion && compareVersions(query.appVersion, MIN_APP_VERSION) < 0) {
      throw new AppException(
        ErrorCode.APP_UPDATE_REQUIRED,
        `App version ${query.appVersion} is older than the minimum ${MIN_APP_VERSION}.`,
      );
    }
    reply.header('cache-control', 'public, max-age=60');
    return {
      dataPack: {
        version: this.catalog.dataVersion,
        publishedAt: this.catalog.publishedAt,
        currencies: (await this.catalog.all()).length,
      },
      minAppVersion: MIN_APP_VERSION,
      models: [],
      serverTime: new Date().toISOString(),
    };
  }
}

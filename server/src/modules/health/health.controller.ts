import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ApiErrorResponses } from '../../common/swagger/api-errors.decorator';
import { APP_VERSION } from '../../version';
import { CatalogRepository } from '../catalog/catalog.repository';

export class LivenessResponse {
  @ApiProperty({ description: 'Always "ok" while the process is running.', enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ description: 'Server software version.', example: '0.1.0' })
  version!: string;

  @ApiProperty({ description: 'Seconds since the server started.', example: 3612 })
  uptimeSeconds!: number;

  @ApiProperty({ description: 'Server clock, UTC.', format: 'date-time', example: '2026-11-08T10:15:30.000Z' })
  time!: string;
}

export class ReadinessCheck {
  @ApiProperty({ description: 'Which dependency was checked.', example: 'catalog' })
  name!: string;

  @ApiProperty({
    description: 'Result of the check. A failing check turns the whole answer into a 503 instead.',
    enum: ['up'],
    example: 'up',
  })
  status!: 'up';
}

export class ReadinessResponse {
  @ApiProperty({ description: 'Always "ready" in a 200 answer.', enum: ['ready'], example: 'ready' })
  status!: 'ready';

  @ApiProperty({ description: 'One entry per dependency that was checked.', type: [ReadinessCheck] })
  checks!: ReadinessCheck[];
}

@ApiTags('Health')
@SkipThrottle()
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly catalog: CatalogRepository) {}

  @Get('health')
  @ApiOperation({
    operationId: 'getLiveness',
    summary: 'Is the server running?',
    description:
      'Liveness check. Answers 200 as long as the process is up, without touching any dependency, so it is safe to call every few seconds. ' +
      'Use it to decide whether to restart the server. To decide whether the server can take traffic, use `/health/ready`.\n\n' +
      'Not versioned and not rate limited.',
  })
  @ApiOkResponse({ type: LivenessResponse, description: 'The server is running.' })
  @ApiErrorResponses('/health', ErrorCode.INTERNAL_ERROR)
  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      time: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Can the server take requests?',
    description:
      'Readiness check. Verifies that everything the API depends on is reachable, today the currency catalogue. ' +
      'Answers 200 when all checks pass and 503 `SERVICE_UNAVAILABLE` otherwise, with the failing check named in `details`. ' +
      'A load balancer should stop sending traffic while this returns 503.\n\n' +
      'Not versioned and not rate limited.',
  })
  @ApiOkResponse({ type: ReadinessResponse, description: 'Every dependency is ready.' })
  @ApiErrorResponses(
    '/health/ready',
    {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      path: '/health/ready',
      message: 'The server is not ready.',
      details: [{ field: 'catalog', problems: ['The catalogue is empty.'] }],
    },
    ErrorCode.INTERNAL_ERROR,
  )
  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.catalog.ping();
    } catch (error) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, 'The server is not ready.', {
        details: [
          {
            field: 'catalog',
            problems: [error instanceof Error ? error.message : 'The check failed.'],
          },
        ],
        headers: { 'retry-after': '5' },
      });
    }
    return { status: 'ready', checks: [{ name: 'catalog', status: 'up' }] };
  }
}

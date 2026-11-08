import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './error-codes';

export class ApiErrorDetail {
  @ApiProperty({
    description: 'The request field the problem is about, e.g. `lines` or `lines.3`.',
    example: 'lines',
  })
  field!: string;

  @ApiProperty({
    description: 'What is wrong with that field, in plain English.',
    type: [String],
    example: ['lines must contain at least 1 elements'],
  })
  problems!: string[];
}

/**
 * The body of every error response, whatever the status. Success responses
 * never use this shape.
 */
export class ApiError {
  @ApiProperty({
    description: 'The HTTP status, repeated here so it survives logging and proxies.',
    example: 404,
  })
  status!: number;

  @ApiProperty({
    description:
      'Stable, machine-readable code. Branch on this, never on `message`. See the error code table at the top of this page.',
    enum: ErrorCode,
    enumName: 'ErrorCode',
    example: ErrorCode.CURRENCY_NOT_FOUND,
  })
  code!: ErrorCode;

  @ApiProperty({
    description: 'What went wrong, written for a developer. May change between versions.',
    example: "No currency with the code 'XYZ'.",
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'What to do next.',
    example: 'List the supported codes with GET /v1/currencies.',
  })
  hint?: string;

  @ApiProperty({
    description:
      'True if sending the same request again later may succeed. False means the request itself has to change.',
    example: false,
  })
  retryable!: boolean;

  @ApiPropertyOptional({
    description: 'Per-field problems. Present for VALIDATION_FAILED.',
    type: [ApiErrorDetail],
  })
  details?: ApiErrorDetail[];

  @ApiProperty({
    description:
      'Identifies this request in the server log. Also sent as the `x-request-id` response header. Quote it when reporting a problem.',
    example: '8f14e45f-ceea-467a-9575-1c9d0b1f0a11',
  })
  requestId!: string;

  @ApiProperty({
    description: 'When the error was produced, UTC.',
    format: 'date-time',
    example: '2026-11-08T10:15:30.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'The path that was requested, without the query string.',
    example: '/v1/currencies/XYZ',
  })
  path!: string;
}

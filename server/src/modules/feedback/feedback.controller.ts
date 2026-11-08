import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Injectable, Post } from '@nestjs/common';
import {
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ErrorCode } from '../../common/errors/error-codes';
import { VERSION_PATTERN } from '../../common/semver';
import { ApiCommonErrors, ApiErrorResponses } from '../../common/swagger/api-errors.decorator';

export enum FeedbackType {
  WRONG_CURRENCY = 'wrong_currency',
  UNREADABLE_SERIAL = 'unreadable_serial',
  UNANSWERED_QUESTION = 'unanswered_question',
  OTHER = 'other',
}

export class FeedbackRequest {
  @ApiProperty({
    description:
      '`wrong_currency`: the app named the wrong currency. `unreadable_serial`: the serial number could not be read. `unanswered_question`: the answer was "I don\'t have that information". `other`: anything else (needs a `message`).',
    enum: FeedbackType,
    enumName: 'FeedbackType',
    example: FeedbackType.WRONG_CURRENCY,
  })
  @IsEnum(FeedbackType, { message: `type must be one of: ${Object.values(FeedbackType).join(', ')}` })
  type!: FeedbackType;

  @ApiPropertyOptional({
    description: 'What happened, in the user\'s words. Required when `type` is `other`.',
    maxLength: 1000,
    example: 'It said US dollar but this is a Canadian note.',
  })
  @ValidateIf((o: FeedbackRequest) => o.type === FeedbackType.OTHER || o.message !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    description: 'The currency the app showed, if any.',
    example: 'USD',
    pattern: '^[A-Za-z]{3}$',
  })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: 'isoCode must be three letters, for example USD' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  isoCode?: string;

  @ApiPropertyOptional({
    description: 'The text OCR read. Helps reproduce the problem. Never send images.',
    type: [String],
    maxItems: 30,
    example: ['BANK OF CANADA', 'TWENTY DOLLARS'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  ocrLines?: string[];

  @ApiPropertyOptional({
    description: 'The app version, as `major.minor.patch`.',
    example: '0.1.0',
  })
  @IsOptional()
  @Matches(VERSION_PATTERN, { message: 'appVersion must look like 1.2.3' })
  appVersion?: string;
}

export class FeedbackReceipt {
  @ApiProperty({ description: 'Quote this if you contact support.', format: 'uuid', example: '5b0f6c1e-7f0e-4a64-9a43-6d6a3f1f8f0b' })
  id!: string;

  @ApiProperty({
    description: 'When the server received the report, UTC.',
    format: 'date-time',
    example: '2026-11-08T10:15:30.000Z',
  })
  receivedAt!: string;
}

/**
 * Holds the most recent reports in memory. A database replaces this later;
 * reports are lost when the server restarts, which is stated in the docs.
 */
@Injectable()
export class FeedbackStore {
  private readonly reports: Array<FeedbackRequest & FeedbackReceipt> = [];
  static readonly CAPACITY = 1000;

  add(report: FeedbackRequest): FeedbackReceipt {
    const receipt = { id: randomUUID(), receivedAt: new Date().toISOString() };
    this.reports.push({ ...report, ...receipt });
    if (this.reports.length > FeedbackStore.CAPACITY) this.reports.shift();
    return receipt;
  }

  get count(): number {
    return this.reports.length;
  }
}

@ApiTags('Feedback')
@ApiCommonErrors()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly store: FeedbackStore) {}

  @Post()
  @HttpCode(201)
  @ApiConsumes('application/json')
  @ApiOperation({
    operationId: 'sendFeedback',
    summary: 'Report a wrong or missing result',
    description:
      'Lets the app tell us when it got something wrong, so the catalogue and the matching can be improved. ' +
      'Send what was read (`ocrLines`) and what the app showed (`isoCode`), never a photo.\n\n' +
      '**Storage.** Reports are kept in server memory, newest 1,000 only, and are lost on restart. A database replaces this in a later version.',
  })
  @ApiCreatedResponse({ type: FeedbackReceipt, description: 'The report was received.' })
  @ApiErrorResponses(
    '/v1/feedback',
    {
      code: ErrorCode.VALIDATION_FAILED,
      path: '/v1/feedback',
      message: 'Invalid message: message must be longer than or equal to 3 characters.',
      details: [{ field: 'message', problems: ['message must be longer than or equal to 3 characters'] }],
    },
    ErrorCode.INVALID_JSON,
    ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    ErrorCode.PAYLOAD_TOO_LARGE,
  )
  sendFeedback(@Body() body: FeedbackRequest): FeedbackReceipt {
    return this.store.add(body);
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AskRequest {
  @ApiProperty({
    description: 'The question, in English. 3 to 500 characters.',
    minLength: 3,
    maxLength: 500,
    example: 'What colour is the 20 euro note?',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({
    description:
      'Limit the answer to one currency, usually the one just scanned. Without it, every currency is searched.',
    example: 'EUR',
    pattern: '^[A-Za-z]{3}$',
  })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: 'isoCode must be three letters, for example EUR' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  isoCode?: string;
}

export class AskSource {
  @ApiProperty({ description: 'The number used in the answer text as [1], [2]...', example: 1 })
  n!: number;

  @ApiProperty({
    description: 'Fact identifier, the same as in GET /v1/currencies/{isoCode}/facts.',
    example: 'eur-020-001',
  })
  id!: string;

  @ApiProperty({ description: 'The fact the answer was built from.', example: 'The 20 euro note is blue.' })
  text!: string;

  @ApiProperty({ description: 'Who published the fact.', example: 'European Central Bank' })
  sourceName!: string;

  @ApiProperty({ description: 'Where it was published.', format: 'uri', example: 'https://www.ecb.europa.eu/' })
  sourceUrl!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class IsoCodeParams {
  @ApiProperty({
    description: 'ISO 4217 currency code. Case-insensitive; the API upper-cases it.',
    example: 'EUR',
    pattern: '^[A-Za-z]{3}$',
  })
  @Matches(/^[A-Za-z]{3}$/, { message: 'isoCode must be three letters, for example EUR' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  isoCode!: string;
}

export class ListCurrenciesQuery {
  @ApiPropertyOptional({
    description: 'Only currencies whose code, name or country contains this text (case-insensitive).',
    example: 'euro',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  @ApiPropertyOptional({ description: 'Page size.', default: 20, minimum: 1, maximum: 100, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'How many currencies to skip.', default: 0, minimum: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class FactsQuery {
  @ApiPropertyOptional({
    description: 'Language of the facts. Only English exists today.',
    enum: ['en'],
    default: 'en',
  })
  @IsOptional()
  @IsIn(['en'], { message: 'lang must be en (no other language is available yet)' })
  lang: 'en' = 'en';

  @ApiPropertyOptional({
    description:
      'Return only facts about this denomination, plus facts about the currency as a whole. Must be a denomination the currency has.',
    example: 20,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  denomination?: number;
}

export class CurrencySummary {
  @ApiProperty({ description: 'ISO 4217 currency code.', example: 'EUR' })
  isoCode!: string;

  @ApiProperty({ description: 'English name of the currency.', example: 'Euro' })
  name!: string;

  @ApiProperty({ description: 'Country or area that uses it.', example: 'Euro area' })
  country!: string;

  @ApiProperty({ description: 'The symbol printed on notes and in prices.', example: '€' })
  symbol!: string;

  @ApiProperty({ description: 'How many denominations the currency has.', example: 7 })
  denominationCount!: number;

  @ApiProperty({
    description: 'Changes whenever any fact of this currency changes. Compare it with the stored copy to know whether to refresh.',
    example: 1,
  })
  factsVersion!: number;
}

export class CurrencyList {
  @ApiProperty({ type: [CurrencySummary] })
  items!: CurrencySummary[];

  @ApiProperty({ description: 'How many currencies match, across all pages.', example: 4 })
  total!: number;

  @ApiProperty({ description: 'The page size that was used.', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'The offset that was used.', example: 0 })
  offset!: number;

  @ApiProperty({
    description: 'Offset of the next page, or null on the last page.',
    nullable: true,
    type: Number,
    example: null,
  })
  nextOffset!: number | null;
}

export class DenominationInfo {
  @ApiProperty({ description: 'Face value.', example: 20 })
  value!: number;

  @ApiProperty({ description: 'Whether it is a banknote or a coin.', enum: ['note', 'coin'], example: 'note' })
  kind!: 'note' | 'coin';
}

export class CurrencyDetail extends CurrencySummary {
  @ApiProperty({ description: 'Who issues the currency.', example: 'European Central Bank' })
  issuer!: string;

  @ApiProperty({ type: [DenominationInfo] })
  denominations!: DenominationInfo[];
}

export class FactSourceInfo {
  @ApiProperty({ description: 'Who published the information.', example: 'European Central Bank' })
  name!: string;

  @ApiProperty({ description: 'Where it was published.', format: 'uri', example: 'https://www.ecb.europa.eu/' })
  url!: string;
}

export class FactInfo {
  @ApiProperty({ description: 'Stable identifier. Safe to store.', example: 'eur-020-001' })
  id!: string;

  @ApiProperty({ description: 'The fact, written as one self-contained sentence.', example: 'The 20 euro note is blue.' })
  text!: string;

  @ApiPropertyOptional({
    description: 'Set when the fact is about one denomination only.',
    example: 20,
  })
  denomination?: number;

  @ApiProperty({ type: FactSourceInfo })
  source!: FactSourceInfo;

  @ApiProperty({
    description:
      '`unverified`: written by hand from public sources and not yet confirmed by the update pipeline. Show it as such.',
    enum: ['unverified', 'verified'],
    example: 'unverified',
  })
  verification!: 'unverified' | 'verified';
}

export class FactsResponse {
  @ApiProperty({ description: 'The currency the facts are about.', example: 'EUR' })
  isoCode!: string;

  @ApiProperty({ description: 'Language the facts are written in.', example: 'en' })
  lang!: string;

  @ApiProperty({
    description: 'Same value as `factsVersion` on the currency.',
    example: 1,
  })
  version!: number;

  @ApiProperty({ type: [FactInfo] })
  facts!: FactInfo[];
}

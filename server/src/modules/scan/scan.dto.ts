import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class ResolveScanRequest {
  @ApiProperty({
    description:
      'The text lines the phone read from one scan, in reading order. Up to 60 lines of 200 characters. ' +
      'Send text only; the API never accepts images.',
    type: [String],
    minItems: 1,
    maxItems: 60,
    example: ['EUROPEAN CENTRAL BANK', 'EURO', '20', 'BCE ECB EZB'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  lines!: string[];
}

export enum ScanStatus {
  MATCHED = 'matched',
  AMBIGUOUS = 'ambiguous',
  UNKNOWN = 'unknown',
}

export class DenominationMatch {
  @ApiProperty({ description: 'Face value that was found printed in the text.', example: 20 })
  value!: number;

  @ApiProperty({ description: 'Whether it is a banknote or a coin.', enum: ['note', 'coin'], example: 'note' })
  kind!: 'note' | 'coin';
}

export class ScanMatch {
  @ApiProperty({ description: 'ISO 4217 code of the candidate currency.', example: 'EUR' })
  isoCode!: string;

  @ApiProperty({ description: 'English name of the currency.', example: 'Euro' })
  name!: string;

  @ApiProperty({
    description:
      'How sure the match is, 0 to 1. It is the sum of the weights of the distinct clues found, capped at 1: issuer name 0.5, currency word 0.4, country 0.3, ISO code 0.25.',
    minimum: 0,
    maximum: 1,
    example: 0.9,
  })
  confidence!: number;

  @ApiProperty({
    description:
      'The denomination, when exactly one denomination of this currency is printed in the text. Absent when none or several are.',
    type: DenominationMatch,
    required: false,
    example: { value: 20, kind: 'note' },
  })
  denomination?: DenominationMatch;

  @ApiProperty({
    description: 'The clues behind the match, so the app can show why.',
    type: [String],
    example: ['Issuer "EUROPEAN CENTRAL BANK"', 'Currency word "EURO"'],
  })
  evidence!: string[];
}

export class ResolveScanResponse {
  @ApiProperty({
    description:
      '`matched`: one clear answer, safe to show. `ambiguous`: there are candidates but none is clear, so ask the user or scan again. `unknown`: nothing in the catalogue fits.',
    enum: ScanStatus,
    enumName: 'ScanStatus',
    example: ScanStatus.MATCHED,
  })
  status!: ScanStatus;

  @ApiProperty({
    description: 'Up to three candidates, best first. Empty when `status` is `unknown`.',
    type: [ScanMatch],
  })
  matches!: ScanMatch[];

  @ApiProperty({
    description: 'What the app should do now, in words.',
    example: 'Show the facts with GET /v1/currencies/EUR/facts.',
  })
  nextStep!: string;
}

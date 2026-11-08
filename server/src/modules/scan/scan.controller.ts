import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorCode } from '../../common/errors/error-codes';
import { ApiCommonErrors, ApiErrorResponses } from '../../common/swagger/api-errors.decorator';
import { CatalogRepository } from '../catalog/catalog.repository';
import { ResolveScanRequest, ResolveScanResponse, ScanStatus } from './scan.dto';
import { resolveScan } from './scan-resolver';

@ApiTags('Scan')
@ApiCommonErrors()
@Controller('scan')
export class ScanController {
  constructor(private readonly catalog: CatalogRepository) {}

  @Post('resolve')
  @HttpCode(200)
  @ApiConsumes('application/json')
  @ApiOperation({
    operationId: 'resolveScan',
    summary: 'Which currency is this note?',
    description:
      'Send the text the phone read from a note and get back the currency it belongs to.\n\n' +
      '**How it decides.** It looks for phrases printed on notes: the issuing bank (worth 0.5), the currency word (0.4), the country (0.3) and the ISO code (0.25). ' +
      'The distinct clues found are added up and capped at 1; each is listed in `evidence`. ' +
      'The answer is `matched` when the best candidate reaches 0.5 and leads the runner-up by at least 0.25.\n\n' +
      '**Always 200 for a valid request.** `unknown` and `ambiguous` are normal answers, not errors. Only a malformed request fails.\n\n' +
      '**Privacy.** The body is text only, at most 32 KB. Nothing is stored.',
  })
  @ApiExtraModels(ResolveScanResponse)
  @ApiBody({
    type: ResolveScanRequest,
    examples: {
      clearMatch: {
        summary: 'A euro note',
        value: { lines: ['EUROPEAN CENTRAL BANK', 'EURO', '20', 'BCE ECB EZB'] },
      },
      oneClueOnly: {
        summary: 'Only a currency word was read',
        value: { lines: ['TWENTY DOLLARS'] },
      },
      notInCatalogue: {
        summary: 'A note from a currency the catalogue does not have',
        value: { lines: ['BANCO CENTRAL', 'CIEN PESOS'] },
      },
    },
  })
  @ApiOkResponse({
    description: 'A decision. Check `status`.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ResolveScanResponse) },
        examples: {
          matched: {
            summary: 'matched: one clear answer',
            value: {
              status: ScanStatus.MATCHED,
              matches: [
                {
                  isoCode: 'EUR',
                  name: 'Euro',
                  confidence: 0.9,
                  denomination: { value: 20, kind: 'note' },
                  // Every clue is listed; clues of one kind count once.
                  evidence: [
                    'Issuer "EUROPEAN CENTRAL BANK"',
                    'Currency word "EURO"',
                    'Issuer "BCE"',
                    'Issuer "ECB"',
                    'Issuer "EZB"',
                    'Denomination 20',
                  ],
                },
              ],
              nextStep: 'Show the facts with GET /v1/currencies/EUR/facts.',
            },
          },
          ambiguous: {
            summary: 'ambiguous: a clue, but not enough',
            value: {
              status: ScanStatus.AMBIGUOUS,
              matches: [
                {
                  isoCode: 'USD',
                  name: 'United States dollar',
                  confidence: 0.4,
                  denomination: { value: 20, kind: 'note' },
                  evidence: ['Currency word "DOLLARS"', 'Denomination 20'],
                },
              ],
              nextStep:
                'Ask the user to confirm one of the candidates, or scan again with the note flat and well lit.',
            },
          },
          unknown: {
            summary: 'unknown: nothing fits',
            value: {
              status: ScanStatus.UNKNOWN,
              matches: [],
              nextStep:
                'This currency is not in the catalogue. Ask the user to scan again; looking up new currencies is not available yet.',
            },
          },
        },
      },
    },
  })
  @ApiErrorResponses(
    '/v1/scan/resolve',
    {
      code: ErrorCode.VALIDATION_FAILED,
      path: '/v1/scan/resolve',
      message: 'Invalid lines: lines must contain at least 1 elements.',
      details: [{ field: 'lines', problems: ['lines must contain at least 1 elements'] }],
    },
    ErrorCode.INVALID_JSON,
    ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    ErrorCode.PAYLOAD_TOO_LARGE,
  )
  async resolveScan(@Body() body: ResolveScanRequest): Promise<ResolveScanResponse> {
    return resolveScan(await this.catalog.all(), body.lines);
  }
}

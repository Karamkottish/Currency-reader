import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ApiCommonErrors, ApiErrorResponses } from '../../common/swagger/api-errors.decorator';
import { CatalogRepository } from '../catalog/catalog.repository';
import { CurrencyRecord } from '../catalog/catalog.types';
import {
  CurrencyDetail,
  CurrencyList,
  CurrencySummary,
  FactsQuery,
  FactsResponse,
  IsoCodeParams,
  ListCurrenciesQuery,
} from './currencies.dto';

const summary = (c: CurrencyRecord): CurrencySummary => ({
  isoCode: c.isoCode,
  name: c.name,
  country: c.country,
  symbol: c.symbol,
  denominationCount: c.denominations.length,
  factsVersion: c.factsVersion,
});

/** True if an If-None-Match header names this ETag (or is `*`). */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const strip = (v: string) => v.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => strip(candidate) === etag);
}

@ApiTags('Currencies')
@ApiCommonErrors()
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly catalog: CatalogRepository) {}

  private async require(isoCode: string): Promise<CurrencyRecord> {
    const currency = await this.catalog.find(isoCode);
    if (!currency) {
      throw new AppException(ErrorCode.CURRENCY_NOT_FOUND, `No currency with the code '${isoCode}'.`);
    }
    return currency;
  }

  @Get()
  @ApiOperation({
    operationId: 'listCurrencies',
    summary: 'List the currencies in the catalogue',
    description:
      'Returns one page of currencies, sorted by catalogue order. Use `q` to search by code, name or country and `limit` / `offset` to page.\n\n' +
      'To fetch every currency, keep requesting with `offset=nextOffset` until `nextOffset` is `null`.',
  })
  @ApiOkResponse({ type: CurrencyList, description: 'One page of currencies. An empty `items` array means nothing matched.' })
  @ApiErrorResponses('/v1/currencies', {
    code: ErrorCode.VALIDATION_FAILED,
    path: '/v1/currencies?limit=500',
    message: 'Invalid limit: limit must not be greater than 100.',
    details: [{ field: 'limit', problems: ['limit must not be greater than 100'] }],
  })
  async listCurrencies(@Query() query: ListCurrenciesQuery): Promise<CurrencyList> {
    const { items, total } = await this.catalog.list(query);
    const next = query.offset + query.limit;
    return {
      items: items.map(summary),
      total,
      limit: query.limit,
      offset: query.offset,
      nextOffset: next < total ? next : null,
    };
  }

  @Get(':isoCode')
  @ApiOperation({
    operationId: 'getCurrency',
    summary: 'Get one currency and its denominations',
    description:
      'Returns the currency with every denomination it has. Use it to learn which values exist before asking for facts about one.',
  })
  @ApiOkResponse({ type: CurrencyDetail, description: 'The currency.' })
  @ApiErrorResponses(
    '/v1/currencies/XYZ',
    ErrorCode.CURRENCY_NOT_FOUND,
    {
      code: ErrorCode.VALIDATION_FAILED,
      path: '/v1/currencies/EURO',
      message: 'Invalid isoCode: isoCode must be three letters, for example EUR.',
      details: [{ field: 'isoCode', problems: ['isoCode must be three letters, for example EUR'] }],
    },
  )
  async getCurrency(@Param() params: IsoCodeParams): Promise<CurrencyDetail> {
    const c = await this.require(params.isoCode);
    return {
      ...summary(c),
      issuer: c.issuer,
      denominations: c.denominations.map((d) => ({ value: d.value, kind: d.kind })),
    };
  }

  @Get(':isoCode/facts')
  @ApiOperation({
    operationId: 'getCurrencyFacts',
    summary: 'Get the sourced facts about a currency',
    description:
      'Every fact carries the source it came from and a `verification` flag. Pass `denomination` to get the facts about one note plus the facts about the currency as a whole.\n\n' +
      '**Checking for changes without downloading again.** The response has an `ETag` that changes whenever the facts do. ' +
      'Send it back in `If-None-Match`; if nothing changed the answer is `304 Not Modified` with no body. ' +
      'This is how the app keeps its saved copy current at almost no cost: show the saved facts at once, then make this conditional request in the background.\n\n' +
      '`Cache-Control: no-cache` means a cache may store the response but must revalidate it every time.',
  })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'The `ETag` of the copy you already hold, quotes included. Send `*` to match anything.',
    example: '"EUR-all-v1"',
  })
  @ApiOkResponse({
    type: FactsResponse,
    description: 'The facts, newest version.',
    headers: {
      ETag: {
        description: 'Identifies this version of the facts. Send it back as `If-None-Match`.',
        schema: { type: 'string', example: '"EUR-all-v1"' },
      },
      'Cache-Control': { schema: { type: 'string', example: 'no-cache' } },
    },
  })
  @ApiResponse({
    status: 304,
    description: 'The copy you hold is still current. There is no body: keep using what you have.',
    headers: { ETag: { schema: { type: 'string', example: '"EUR-all-v1"' } } },
  })
  @ApiErrorResponses(
    '/v1/currencies/EUR/facts?denomination=25',
    ErrorCode.CURRENCY_NOT_FOUND,
    {
      code: ErrorCode.DENOMINATION_NOT_FOUND,
      path: '/v1/currencies/EUR/facts?denomination=25',
      message: 'EUR has no 25 denomination.',
    },
    {
      code: ErrorCode.VALIDATION_FAILED,
      path: '/v1/currencies/EUR/facts?lang=fr',
      message: 'Invalid lang: lang must be en (no other language is available yet).',
      details: [{ field: 'lang', problems: ['lang must be en (no other language is available yet)'] }],
    },
  )
  async getCurrencyFacts(
    @Param() params: IsoCodeParams,
    @Query() query: FactsQuery,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FactsResponse | undefined> {
    const currency = await this.require(params.isoCode);
    if (
      query.denomination !== undefined &&
      !currency.denominations.some((d) => d.value === query.denomination)
    ) {
      throw new AppException(
        ErrorCode.DENOMINATION_NOT_FOUND,
        `${currency.isoCode} has no ${query.denomination} denomination.`,
      );
    }

    const etag = `"${currency.isoCode}-${query.denomination ?? 'all'}-v${currency.factsVersion}"`;
    reply.header('etag', etag).header('cache-control', 'no-cache');
    if (etagMatches(ifNoneMatch, etag)) {
      reply.status(304);
      return undefined;
    }

    const facts = await this.catalog.factsOf(currency.isoCode, query.denomination);
    return {
      isoCode: currency.isoCode,
      lang: query.lang,
      version: currency.factsVersion,
      facts: facts.map((f) => ({
        id: f.id,
        text: f.text,
        ...(f.denomination !== undefined ? { denomination: f.denomination } : {}),
        source: f.source,
        verification: f.verification,
      })),
    };
  }
}

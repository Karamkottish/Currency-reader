import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { requestIdFor } from '../../src/app.setup';
import { AppException } from '../../src/common/errors/app.exception';
import { ERROR_CATALOG, ErrorCode } from '../../src/common/errors/error-codes';
import { mapError } from '../../src/common/errors/error-mapper';
import { flattenValidationErrors } from '../../src/common/pipes/validation.pipe';
import { compareVersions, parseVersion } from '../../src/common/semver';
import { ConfigError, loadConfig } from '../../src/config/app-config';
import { etagMatches } from '../../src/modules/currencies/currencies.controller';
import { retrieveFacts } from '../../src/modules/ask/ask.service';
import { ExtractiveLlmService } from '../../src/modules/ask/llm.service';
import { SEED_CURRENCIES, SEED_FACTS } from '../../src/modules/catalog/catalog.seed';
import { normalizeText, resolveScan } from '../../src/modules/scan/scan-resolver';
import { ScanStatus } from '../../src/modules/scan/scan.dto';
import { APP_VERSION } from '../../src/version';

const ctx = { requestId: 'req-1', path: '/v1/x', now: new Date('2026-01-01T00:00:00Z') };

describe('version', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('configuration', () => {
  it('has safe defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      swaggerEnabled: true,
      rateLimitPerMinute: 60,
      askRateLimitPerMinute: 10,
      trustProxy: false,
      corsOrigins: [],
    });
  });

  it('turns the docs off in production unless asked', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(true);
  });

  it('reports every problem at once, in plain words', () => {
    try {
      loadConfig({ PORT: 'abc', NODE_ENV: 'staging', LOG_LEVEL: 'loud', CORS_ORIGINS: 'example.com/path', SWAGGER_ENABLED: 'maybe' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const problems = (e as ConfigError).problems;
      expect(problems).toHaveLength(5);
      expect(problems.join('\n')).toMatch(/PORT must be a whole number/);
      expect(problems.join('\n')).toMatch(/NODE_ENV must be/);
      expect(problems.join('\n')).toMatch(/LOG_LEVEL must be/);
      expect(problems.join('\n')).toMatch(/CORS_ORIGINS has "example.com\/path"/);
      expect(problems.join('\n')).toMatch(/SWAGGER_ENABLED must be true or false/);
    }
  });

  it('turns a log level into every level at or above it', () => {
    expect(loadConfig({ LOG_LEVEL: 'warn' }).logLevels).toEqual(['fatal', 'error', 'warn']);
  });

  it('accepts a list of origins', () => {
    expect(loadConfig({ CORS_ORIGINS: 'https://a.example, https://b.example:8443' }).corsOrigins).toEqual([
      'https://a.example',
      'https://b.example:8443',
    ]);
  });
});

describe('semver', () => {
  it('parses only major.minor.patch', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    for (const bad of ['1.2', '1.2.3.4', 'v1.2.3', '01.2.3', '1.2.x', '']) {
      expect(parseVersion(bad)).toBeNull();
    }
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.0.9', '0.1.0')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});

describe('error catalogue', () => {
  it('has an entry, a status and an actionable hint for every code', () => {
    for (const code of Object.values(ErrorCode)) {
      const info = ERROR_CATALOG[code];
      expect(info.status).toBeGreaterThanOrEqual(400);
      expect(info.summary.length).toBeGreaterThan(20);
      expect(info.hint.length).toBeGreaterThan(10);
    }
  });

  it('marks 5xx and 429 as retryable and the rest as not', () => {
    for (const code of Object.values(ErrorCode)) {
      const { status, retryable } = ERROR_CATALOG[code];
      expect(retryable).toBe(status >= 500 || status === 429);
    }
  });
});

describe('mapError', () => {
  it('keeps our own exceptions as they are', () => {
    const m = mapError(
      new AppException(ErrorCode.CURRENCY_NOT_FOUND, 'nope', { hint: 'try this', headers: { 'x-a': '1' } }),
      ctx,
    );
    expect(m.body).toMatchObject({
      status: 404, code: 'CURRENCY_NOT_FOUND', message: 'nope', hint: 'try this',
      retryable: false, requestId: 'req-1', path: '/v1/x', timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(m.headers).toEqual({ 'x-a': '1' });
    expect(m.log).toBe('none');
  });

  it('turns an unknown route into ROUTE_NOT_FOUND', () => {
    const m = mapError(new NotFoundException('Cannot GET /v1/nope'), { ...ctx, path: '/v1/nope' });
    expect(m.body).toMatchObject({ status: 404, code: 'ROUTE_NOT_FOUND', message: 'There is no endpoint at /v1/nope.' });
  });

  it('maps web server parse errors to specific codes', () => {
    const e = (code: string, statusCode: number) => Object.assign(new Error('x'), { code, statusCode });
    expect(mapError(e('FST_ERR_CTP_INVALID_JSON_BODY', 400), ctx).body.code).toBe('INVALID_JSON');
    expect(mapError(e('FST_ERR_CTP_EMPTY_JSON_BODY', 400), ctx).body.code).toBe('INVALID_JSON');
    expect(mapError(e('FST_ERR_CTP_BODY_TOO_LARGE', 413), ctx).body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
    expect(mapError(e('FST_ERR_CTP_INVALID_MEDIA_TYPE', 415), ctx).body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 });
  });

  it('keeps the real status for other client errors', () => {
    const m = mapError(new HttpException('teapot', 418), ctx);
    expect(m.body).toMatchObject({ status: 418, code: 'BAD_REQUEST', message: 'teapot' });
  });

  it('turns 400s from framework pipes into BAD_REQUEST', () => {
    expect(mapError(new BadRequestException('Validation failed (numeric string is expected)'), ctx).body.code).toBe('BAD_REQUEST');
  });

  it('never leaks the cause of an unexpected error', () => {
    const m = mapError(new Error('password=hunter2 at db.ts:42'), ctx);
    expect(m.body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' });
    expect(JSON.stringify(m.body)).not.toContain('hunter2');
    expect(m.log).toBe('error');
  });

  it('survives being thrown a non-error', () => {
    expect(mapError('oops', ctx).body.code).toBe('INTERNAL_ERROR');
    expect(mapError(undefined, ctx).body.code).toBe('INTERNAL_ERROR');
  });
});

describe('flattenValidationErrors', () => {
  it('keeps the path of nested and array fields', () => {
    const rows = flattenValidationErrors([
      { property: 'lines', children: [{ property: '3', constraints: { maxLength: 'too long' }, children: [] }], constraints: undefined },
      { property: 'type', constraints: { isEnum: 'bad type' }, children: [] },
    ]);
    expect(rows).toEqual([
      { field: 'lines.3', problems: ['too long'] },
      { field: 'type', problems: ['bad type'] },
    ]);
  });
});

describe('request ids', () => {
  it('keeps a safe id', () => expect(requestIdFor('abc-123_X')).toBe('abc-123_X'));
  it('replaces anything that could break a log line', () => {
    for (const bad of ['has space', 'a\nb', '<script>', 'x'.repeat(65), '', undefined]) {
      expect(requestIdFor(bad)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  it('uses the first of repeated headers', () => expect(requestIdFor(['one', 'two'])).toBe('one'));
});

describe('etagMatches', () => {
  const tag = '"EUR-all-v1"';
  it('matches exactly, weakly, in a list, and with *', () => {
    expect(etagMatches(tag, tag)).toBe(true);
    expect(etagMatches(`W/${tag}`, tag)).toBe(true);
    expect(etagMatches(`"x", ${tag}`, tag)).toBe(true);
    expect(etagMatches('*', tag)).toBe(true);
  });
  it('does not match a different or missing tag', () => {
    expect(etagMatches('"EUR-all-v0"', tag)).toBe(false);
    expect(etagMatches(undefined, tag)).toBe(false);
    expect(etagMatches('', tag)).toBe(false);
  });
});

describe('scan resolver', () => {
  const resolve = (...lines: string[]) => resolveScan(SEED_CURRENCIES, lines);

  it('normalises accents, case, punctuation and thousands separators', () => {
    expect(normalizeText('Banque Centrale Européenne')).toBe('BANQUE CENTRALE EUROPEENNE');
    expect(normalizeText('¥10,000 / 10.000')).toBe('10000 10000');
  });

  it('matches a euro note with high confidence and finds the denomination', () => {
    const r = resolve('EUROPEAN CENTRAL BANK', 'EURO', '20');
    expect(r.status).toBe(ScanStatus.MATCHED);
    expect(r.matches[0]).toMatchObject({ isoCode: 'EUR', confidence: 0.9, denomination: { value: 20, kind: 'note' } });
    expect(r.matches[0].evidence).toEqual([
      'Issuer "EUROPEAN CENTRAL BANK"', 'Currency word "EURO"', 'Denomination 20',
    ]);
    expect(r.nextStep).toContain('/v1/currencies/EUR/facts');
  });

  it('is ambiguous with a single weak clue', () => {
    const r = resolve('TWENTY DOLLARS');
    expect(r.status).toBe(ScanStatus.AMBIGUOUS);
    expect(r.matches[0]).toMatchObject({ isoCode: 'USD', confidence: 0.4 });
  });

  it('is unknown when nothing fits, and says what to do', () => {
    const r = resolve('BANCO CENTRAL', 'CIEN PESOS');
    expect(r).toMatchObject({ status: ScanStatus.UNKNOWN, matches: [] });
    expect(r.nextStep).toMatch(/not in the catalogue/);
  });

  it('counts one clue of each kind once, however often it is printed', () => {
    const r = resolve('BANK OF ENGLAND', 'BANK OF ENGLAND', 'BANK OF ENGLAND');
    expect(r.matches[0].confidence).toBe(0.5);
  });

  it('does not count FEDERAL RESERVE inside FEDERAL RESERVE NOTE twice', () => {
    const r = resolve('FEDERAL RESERVE NOTE');
    expect(r.matches[0].evidence).toEqual(['Issuer "FEDERAL RESERVE NOTE"']);
  });

  it('leaves the denomination out when several are printed', () => {
    expect(resolve('EURO', '5', '10').matches[0].denomination).toBeUndefined();
  });

  it('does not read digits inside a serial number as a denomination', () => {
    expect(resolve('EURO', 'X12034567890').matches[0].denomination).toBeUndefined();
  });

  it('reads yen amounts with a thousands separator', () => {
    const r = resolve('BANK OF JAPAN', 'YEN', '10,000');
    expect(r.status).toBe(ScanStatus.MATCHED);
    expect(r.matches[0].denomination?.value).toBe(10000);
  });

  it('reports two close candidates as ambiguous, best first', () => {
    const r = resolve('POUND', 'DOLLAR');
    expect(r.status).toBe(ScanStatus.AMBIGUOUS);
    expect(r.matches.map((m) => m.isoCode).sort()).toEqual(['GBP', 'USD']);
  });

  it('never returns more than three candidates', () => {
    expect(resolve('EURO DOLLAR POUND YEN').matches.length).toBeLessThanOrEqual(3);
  });
});

describe('fact retrieval', () => {
  it('prefers facts about the denomination that was named', () => {
    const r = retrieveFacts(SEED_FACTS.filter((f) => f.isoCode === 'EUR'), 'What colour is the 20 euro note?');
    expect(r[0].fact.id).toBe('eur-020-001');
  });

  it('returns nothing for a question the facts do not touch', () => {
    expect(retrieveFacts(SEED_FACTS, 'Who won the football match?')).toEqual([]);
  });

  it('ignores stop words, so "the" cannot make a match', () => {
    expect(retrieveFacts(SEED_FACTS, 'the the the of')).toEqual([]);
  });

  it('returns at most the limit', () => {
    expect(retrieveFacts(SEED_FACTS, 'euro banknotes issued', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('seed data', () => {
  it('has unique fact ids, and every fact has a source and belongs to a currency', () => {
    const ids = SEED_FACTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codes = new Set(SEED_CURRENCIES.map((c) => c.isoCode));
    for (const f of SEED_FACTS) {
      expect(codes.has(f.isoCode)).toBe(true);
      expect(f.source.url).toMatch(/^https:\/\//);
      expect(f.verification).toBe('unverified');
    }
  });

  it('only attaches a denomination to a fact when the currency has it', () => {
    for (const f of SEED_FACTS.filter((x) => x.denomination !== undefined)) {
      const c = SEED_CURRENCIES.find((x) => x.isoCode === f.isoCode)!;
      expect(c.denominations.some((d) => d.value === f.denomination)).toBe(true);
    }
  });
});

describe('ExtractiveLlmService', () => {
  const sources = [{ n: 1, id: 'a', text: 'Blue.', sourceName: 's', sourceUrl: 'https://x.test/' }];
  const svc = new ExtractiveLlmService({ askTokenDelayMs: 0 } as never);
  const collect = async (signal: AbortSignal, s = sources) => {
    let out = '';
    for await (const piece of svc.stream({ prompt: '', sources: s }, signal)) out += piece;
    return out;
  };

  it('quotes the facts with their numbers', async () => {
    expect((await collect(new AbortController().signal)).trim()).toBe('Blue. [1]');
  });

  it('declines when there is nothing to quote', async () => {
    expect((await collect(new AbortController().signal, [])).trim()).toBe("I don't have that information yet.");
  });

  it('stops at once when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await collect(ac.signal)).toBe('');
  });
});

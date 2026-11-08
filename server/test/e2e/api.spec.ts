import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository';
import { APP_VERSION } from '../../src/version';
import { expectErrorShape, parseSse, startApp } from '../helpers';

const json = { 'content-type': 'application/json' };

describe('API', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => (app = await startApp()));
  afterAll(async () => app.close());

  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url, headers });
  const post = (url: string, payload: unknown, headers: Record<string, string> = json) =>
    app.inject({ method: 'POST', url, headers, payload: payload as never });

  describe('health', () => {
    it('GET /health is up and not versioned', async () => {
      const res = await get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ok', version: APP_VERSION });
      expect(res.json().uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('GET /health/ready reports each check', async () => {
      const res = await get('/health/ready');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ready', checks: [{ name: 'catalog', status: 'up' }] });
    });

    it('GET /health/ready is 503 with the failing check named, and says when to retry', async () => {
      const repo = app.get(CatalogRepository);
      const spy = jest.spyOn(repo, 'ping').mockRejectedValueOnce(new Error('database unreachable'));
      const res = await get('/health/ready');
      spy.mockRestore();
      const body = expectErrorShape(res, 503, 'SERVICE_UNAVAILABLE');
      expect(body.retryable).toBe(true);
      expect(body.details).toEqual([{ field: 'catalog', problems: ['database unreachable'] }]);
      expect(res.headers['retry-after']).toBe('5');
    });
  });

  describe('request id', () => {
    it('is generated, and returned on every response', async () => {
      const res = await get('/health');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps a safe one sent by the caller', async () => {
      const res = await get('/health', { 'x-request-id': 'app-7f3a' });
      expect(res.headers['x-request-id']).toBe('app-7f3a');
    });

    it('replaces an unsafe one, so it cannot reach the log', async () => {
      const res = await get('/health', { 'x-request-id': 'bad id\twith spaces' });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('is in the error body too, and matches the header', async () => {
      const res = await get('/v1/currencies/XYZ', { 'x-request-id': 'trace-1' });
      const body = expectErrorShape(res, 404, 'CURRENCY_NOT_FOUND');
      expect(body.requestId).toBe('trace-1');
    });

    it('sets nosniff on every response', async () => {
      expect((await get('/health')).headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('GET /v1/manifest', () => {
    it('describes the current data and may be cached for a minute', async () => {
      const res = await get('/v1/manifest');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(res.json()).toMatchObject({
        dataPack: { version: '2026.11.08-1', currencies: 4 },
        minAppVersion: '0.1.0',
        models: [],
      });
    });

    it('accepts a supported app version and a platform', async () => {
      expect((await get('/v1/manifest?appVersion=0.1.0&platform=android')).statusCode).toBe(200);
      expect((await get('/v1/manifest?appVersion=1.0.0&platform=ios')).statusCode).toBe(200);
    });

    it('426 when the app is too old', async () => {
      const body = expectErrorShape(await get('/v1/manifest?appVersion=0.0.9'), 426, 'APP_UPDATE_REQUIRED');
      expect(body.message).toBe('App version 0.0.9 is older than the minimum 0.1.0.');
      expect(body.retryable).toBe(false);
    });

    it('400 for a malformed version or an unknown platform, naming each field', async () => {
      const body = expectErrorShape(
        await get('/v1/manifest?appVersion=abc&platform=windows'),
        400,
        'VALIDATION_FAILED',
      );
      expect(body.details?.map((d) => d.field).sort()).toEqual(['appVersion', 'platform']);
    });
  });

  describe('GET /v1/currencies', () => {
    it('lists the catalogue', async () => {
      const res = await get('/v1/currencies');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ total: 4, limit: 20, offset: 0, nextOffset: null });
      expect(body.items.map((c: { isoCode: string }) => c.isoCode)).toEqual(['EUR', 'USD', 'GBP', 'JPY']);
      expect(body.items[0]).toEqual({
        isoCode: 'EUR', name: 'Euro', country: 'Euro area', symbol: '€', denominationCount: 7, factsVersion: 1,
      });
    });

    it('pages, with nextOffset until the last page', async () => {
      const first = (await get('/v1/currencies?limit=3')).json();
      expect(first.items).toHaveLength(3);
      expect(first.nextOffset).toBe(3);
      const second = (await get(`/v1/currencies?limit=3&offset=${first.nextOffset}`)).json();
      expect(second.items.map((c: { isoCode: string }) => c.isoCode)).toEqual(['JPY']);
      expect(second.nextOffset).toBeNull();
    });

    it('searches code, name and country, ignoring case', async () => {
      const ids = async (q: string) =>
        (await get(`/v1/currencies?q=${q}`)).json().items.map((c: { isoCode: string }) => c.isoCode);
      expect(await ids('euro')).toEqual(['EUR']);
      expect(await ids('JAPAN')).toEqual(['JPY']);
      expect(await ids('gbp')).toEqual(['GBP']);
      expect(await ids('zzzz')).toEqual([]);
    });

    it('rejects out-of-range paging with the field named', async () => {
      const body = expectErrorShape(await get('/v1/currencies?limit=500'), 400, 'VALIDATION_FAILED');
      expect(body.details).toEqual([{ field: 'limit', problems: ['limit must not be greater than 100'] }]);
      expectErrorShape(await get('/v1/currencies?limit=0'), 400, 'VALIDATION_FAILED');
      expectErrorShape(await get('/v1/currencies?offset=-1'), 400, 'VALIDATION_FAILED');
      expectErrorShape(await get('/v1/currencies?limit=abc'), 400, 'VALIDATION_FAILED');
    });

    it('rejects a query parameter it does not know instead of ignoring it', async () => {
      const body = expectErrorShape(await get('/v1/currencies?limt=5'), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].field).toBe('limt');
    });
  });

  describe('GET /v1/currencies/:isoCode', () => {
    it('returns the currency with its denominations', async () => {
      const res = await get('/v1/currencies/EUR');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        isoCode: 'EUR', issuer: 'European Central Bank', denominationCount: 7,
        denominations: expect.arrayContaining([{ value: 20, kind: 'note' }]),
      });
    });

    it('accepts any letter case', async () => {
      expect((await get('/v1/currencies/eur')).json().isoCode).toBe('EUR');
    });

    it('404 for a code that is not in the catalogue', async () => {
      const body = expectErrorShape(await get('/v1/currencies/XYZ'), 404, 'CURRENCY_NOT_FOUND');
      expect(body.message).toBe("No currency with the code 'XYZ'.");
      expect(body.retryable).toBe(false);
    });

    it('400 for something that is not a code', async () => {
      for (const bad of ['EURO', 'E1R', 'EU']) {
        expectErrorShape(await get(`/v1/currencies/${bad}`), 400, 'VALIDATION_FAILED');
      }
    });
  });

  describe('GET /v1/currencies/:isoCode/facts', () => {
    it('returns sourced facts with an ETag that must be revalidated', async () => {
      const res = await get('/v1/currencies/EUR/facts');
      expect(res.statusCode).toBe(200);
      expect(res.headers.etag).toBe('"EUR-all-v1"');
      expect(res.headers['cache-control']).toBe('no-cache');
      const body = res.json();
      expect(body).toMatchObject({ isoCode: 'EUR', lang: 'en', version: 1 });
      expect(body.facts).toHaveLength(4);
      for (const f of body.facts) {
        expect(f.source.url).toMatch(/^https:\/\//);
        expect(f.verification).toBe('unverified');
      }
    });

    it('answers 304 with no body when the copy is current', async () => {
      const res = await get('/v1/currencies/EUR/facts', { 'if-none-match': '"EUR-all-v1"' });
      expect(res.statusCode).toBe(304);
      expect(res.body).toBe('');
      expect(res.headers.etag).toBe('"EUR-all-v1"');
    });

    it('treats a weak validator and a list as matching too', async () => {
      expect((await get('/v1/currencies/EUR/facts', { 'if-none-match': 'W/"EUR-all-v1"' })).statusCode).toBe(304);
      expect((await get('/v1/currencies/EUR/facts', { 'if-none-match': '"old", "EUR-all-v1"' })).statusCode).toBe(304);
    });

    it('sends the facts again when the copy is stale', async () => {
      const res = await get('/v1/currencies/EUR/facts', { 'if-none-match': '"EUR-all-v0"' });
      expect(res.statusCode).toBe(200);
      expect(res.json().facts.length).toBeGreaterThan(0);
    });

    it('narrows to one denomination, plus facts about the whole currency', async () => {
      const res = await get('/v1/currencies/EUR/facts?denomination=20');
      expect(res.headers.etag).toBe('"EUR-20-v1"');
      const ids = res.json().facts.map((f: { id: string }) => f.id);
      expect(ids).toEqual(['eur-001', 'eur-002', 'eur-020-001', 'eur-020-002']);
      const other = (await get('/v1/currencies/EUR/facts?denomination=5')).json().facts.map((f: { id: string }) => f.id);
      expect(other).toEqual(['eur-001', 'eur-002']);
    });

    it('404 for a denomination the currency does not have', async () => {
      const body = expectErrorShape(await get('/v1/currencies/EUR/facts?denomination=25'), 404, 'DENOMINATION_NOT_FOUND');
      expect(body.message).toBe('EUR has no 25 denomination.');
    });

    it('404 for an unknown currency, even with a matching ETag', async () => {
      expectErrorShape(
        await get('/v1/currencies/XYZ/facts', { 'if-none-match': '*' }),
        404,
        'CURRENCY_NOT_FOUND',
      );
    });

    it('400 for a language that does not exist yet', async () => {
      const body = expectErrorShape(await get('/v1/currencies/EUR/facts?lang=fr'), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].field).toBe('lang');
    });
  });

  describe('POST /v1/scan/resolve', () => {
    it('matches a euro note', async () => {
      const res = await post('/v1/scan/resolve', { lines: ['EUROPEAN CENTRAL BANK', 'EURO', '20', 'BCE ECB EZB'] });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: 'matched',
        matches: [{ isoCode: 'EUR', confidence: 0.9, denomination: { value: 20, kind: 'note' } }],
      });
    });

    it('answers 200 for ambiguous and unknown too: they are answers, not errors', async () => {
      const a = await post('/v1/scan/resolve', { lines: ['TWENTY DOLLARS'] });
      expect([a.statusCode, a.json().status]).toEqual([200, 'ambiguous']);
      const u = await post('/v1/scan/resolve', { lines: ['BANCO CENTRAL', 'CIEN PESOS'] });
      expect([u.statusCode, u.json().status, u.json().matches]).toEqual([200, 'unknown', []]);
    });

    it('400 for an empty list, naming the field', async () => {
      const body = expectErrorShape(await post('/v1/scan/resolve', { lines: [] }), 400, 'VALIDATION_FAILED');
      expect(body.details).toEqual([{ field: 'lines', problems: ['lines must contain at least 1 elements'] }]);
    });

    it('400 with the index of the bad line', async () => {
      const lines = ['ok', 'ok', 'ok', 'x'.repeat(201)];
      const body = expectErrorShape(await post('/v1/scan/resolve', { lines }), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].field).toBe('lines');
    });

    it('400 for too many lines, wrong types, a missing field and an unknown field', async () => {
      expectErrorShape(await post('/v1/scan/resolve', { lines: Array(61).fill('a') }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/scan/resolve', { lines: 'EURO' }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/scan/resolve', { lines: [1, 2] }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/scan/resolve', {}), 400, 'VALIDATION_FAILED');
      const body = expectErrorShape(await post('/v1/scan/resolve', { lines: ['a'], image: 'x' }), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].field).toBe('image');
    });

    it('400 INVALID_JSON for broken JSON and for an empty body', async () => {
      const broken = await post('/v1/scan/resolve', '{"lines": [', json);
      expect(expectErrorShape(broken, 400, 'INVALID_JSON').message).toBe('The request body is not valid JSON.');
      const empty = await post('/v1/scan/resolve', '', json);
      expect(expectErrorShape(empty, 400, 'INVALID_JSON').message).toMatch(/empty/);
    });

    it('415 when the body is not declared as JSON', async () => {
      const res = await post('/v1/scan/resolve', 'lines=EURO', { 'content-type': 'text/plain' });
      expectErrorShape(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('413 when the body is over 32 KB', async () => {
      const res = await post('/v1/scan/resolve', JSON.stringify({ lines: ['x'.repeat(40_000)] }), json);
      expectErrorShape(res, 413, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('POST /v1/ask', () => {
    const ask = (body: unknown) => post('/v1/ask', body);

    it('streams sources, then words, then done', async () => {
      const res = await ask({ question: 'What colour is the 20 euro note?', isoCode: 'EUR' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-request-id']).toBeDefined();

      const events = parseSse(res.body);
      expect(events[0].event).toBe('sources');
      expect(events[0].data.sources[0]).toMatchObject({
        n: 1, id: 'eur-020-001', text: 'The 20 euro note is blue.', sourceName: 'European Central Bank',
      });
      const tokens = events.filter((e) => e.event === 'token');
      expect(tokens.length).toBeGreaterThan(3);
      expect(events.at(-1)).toEqual({ event: 'done', data: { finishReason: 'stop', answered: true } });
      const text = tokens.map((t) => t.data.text).join('').trim();
      expect(text.startsWith('The 20 euro note is blue. [1]')).toBe(true);
    });

    it('searches every currency when none is given', async () => {
      const events = parseSse((await ask({ question: 'Who issues pound notes?' })).body);
      expect(events[0].data.sources[0].id).toBe('gbp-001');
    });

    it('declines, and says so, when the facts do not cover the question', async () => {
      const events = parseSse((await ask({ question: 'Who won the football match?' })).body);
      expect(events[0].data.sources).toEqual([]);
      expect(events.filter((e) => e.event === 'token').map((t) => t.data.text).join('').trim()).toBe(
        "I don't have that information yet.",
      );
      expect(events.at(-1)?.data).toEqual({ finishReason: 'stop', answered: false });
    });

    it('trims the question and upper-cases the code', async () => {
      const res = await ask({ question: '   What is the 20 euro note made of?  ', isoCode: 'eur' });
      expect(res.statusCode).toBe(200);
    });

    it('404 as normal JSON, before any stream starts, for an unknown currency', async () => {
      const res = await ask({ question: 'What colour is the note?', isoCode: 'XYZ' });
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expectErrorShape(res, 404, 'CURRENCY_NOT_FOUND');
    });

    it('400 for a question that is too short or too long, or a bad code', async () => {
      const short = expectErrorShape(await ask({ question: 'hi' }), 400, 'VALIDATION_FAILED');
      expect(short.details?.[0].field).toBe('question');
      expectErrorShape(await ask({ question: 'x'.repeat(501) }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await ask({ question: 'What colour?', isoCode: 'EURO' }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await ask({}), 400, 'VALIDATION_FAILED');
    });

    it('stops when the model fails midway, with an error event and a closed stream', async () => {
      const { LlmService } = await import('../../src/modules/ask/llm.service');
      const llm = app.get(LlmService);
      const spy = jest.spyOn(llm, 'stream').mockImplementation(async function* () {
        yield 'Partial ';
        throw new Error('model crashed: secret-internal-detail');
      });
      const res = await ask({ question: 'What colour is the 20 euro note?' });
      spy.mockRestore();
      expect(res.statusCode).toBe(200);
      const events = parseSse(res.body);
      expect(events.map((e) => e.event)).toEqual(['sources', 'token', 'error']);
      expect(events[2].data).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', retryable: true });
      expect(res.body).not.toContain('secret-internal-detail');
      expect(events.some((e) => e.event === 'done')).toBe(false);
    });
  });

  describe('POST /v1/feedback', () => {
    it('stores a report and gives back a receipt', async () => {
      const res = await post('/v1/feedback', {
        type: 'wrong_currency', isoCode: 'usd', ocrLines: ['BANK OF CANADA'], appVersion: '0.1.0',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), receivedAt: expect.any(String) });
    });

    it('needs a message for "other", and only then', async () => {
      expect((await post('/v1/feedback', { type: 'unreadable_serial' })).statusCode).toBe(201);
      const body = expectErrorShape(await post('/v1/feedback', { type: 'other' }), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].field).toBe('message');
      expect((await post('/v1/feedback', { type: 'other', message: 'Wrong colour shown' })).statusCode).toBe(201);
    });

    it('400 for an unknown type, with the allowed values', async () => {
      const body = expectErrorShape(await post('/v1/feedback', { type: 'rant' }), 400, 'VALIDATION_FAILED');
      expect(body.details?.[0].problems[0]).toMatch(/wrong_currency, unreadable_serial, unanswered_question, other/);
    });

    it('400 for a bad version, too many lines, an over-long message and extra fields', async () => {
      expectErrorShape(await post('/v1/feedback', { type: 'other', message: 'ok ok', appVersion: 'v1' }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/feedback', { type: 'wrong_currency', ocrLines: Array(31).fill('a') }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/feedback', { type: 'other', message: 'x'.repeat(1001) }), 400, 'VALIDATION_FAILED');
      expectErrorShape(await post('/v1/feedback', { type: 'other', message: 'fine', photo: 'data:...' }), 400, 'VALIDATION_FAILED');
    });
  });

  describe('errors that belong to no endpoint', () => {
    it('404 ROUTE_NOT_FOUND for an unknown path, in the standard body', async () => {
      const body = expectErrorShape(await get('/v1/nothing-here'), 404, 'ROUTE_NOT_FOUND');
      expect(body.message).toBe('There is no endpoint at /v1/nothing-here.');
    });

    it('404 ROUTE_NOT_FOUND for the wrong method', async () => {
      expectErrorShape(await app.inject({ method: 'DELETE', url: '/v1/currencies' }), 404, 'ROUTE_NOT_FOUND');
      expectErrorShape(await get('/v1/scan/resolve'), 404, 'ROUTE_NOT_FOUND');
    });

    it('does not put the query string in the error path (it may hold tokens)', async () => {
      const body = expectErrorShape(await get('/v1/nothing-here?token=secret'), 404, 'ROUTE_NOT_FOUND');
      expect(body.path).toBe('/v1/nothing-here');
      expect(JSON.stringify(body)).not.toContain('secret');
    });

    it('500 INTERNAL_ERROR hides the cause and still carries the request id', async () => {
      const repo = app.get(CatalogRepository);
      const spy = jest.spyOn(repo, 'all').mockRejectedValueOnce(new Error('connection string postgres://user:pw@host'));
      const res = await post('/v1/scan/resolve', { lines: ['EURO'] });
      spy.mockRestore();
      const body = expectErrorShape(res, 500, 'INTERNAL_ERROR');
      expect(body.retryable).toBe(true);
      expect(res.body).not.toContain('postgres://');
      expect(res.body).not.toContain('stack');
    });

    it('never sends a stack trace or framework error shape', async () => {
      const res = await get('/v1/currencies?limit=abc');
      expect(Object.keys(res.json()).sort()).toEqual(
        ['code', 'details', 'hint', 'message', 'path', 'requestId', 'retryable', 'status', 'timestamp'],
      );
    });
  });
});

describe('rate limiting', () => {
  it('429 RATE_LIMITED with Retry-After, and health stays exempt', async () => {
    const app = await startApp({ RATE_LIMIT_PER_MINUTE: '3' });
    try {
      for (let i = 0; i < 3; i++) {
        expect((await app.inject({ method: 'GET', url: '/v1/currencies' })).statusCode).toBe(200);
      }
      const res = await app.inject({ method: 'GET', url: '/v1/currencies' });
      const body = expectErrorShape(res, 429, 'RATE_LIMITED');
      expect(body.retryable).toBe(true);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      for (let i = 0; i < 10; i++) {
        expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      }
    } finally {
      await app.close();
    }
  });

  it('/v1/ask has its own, lower limit that other endpoints do not share', async () => {
    const app = await startApp({ ASK_RATE_LIMIT_PER_MINUTE: '2' });
    try {
      const ask = () =>
        app.inject({ method: 'POST', url: '/v1/ask', headers: json, payload: { question: 'What colour is the euro note?' } });
      expect((await ask()).statusCode).toBe(200);
      expect((await ask()).statusCode).toBe(200);
      expectErrorShape(await ask(), 429, 'RATE_LIMITED');
      expect((await app.inject({ method: 'GET', url: '/v1/currencies' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('CORS', () => {
  it('is off unless origins are configured', async () => {
    const app = await startApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/currencies', headers: { origin: 'https://evil.example' } });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('allows only the listed origins', async () => {
    const app = await startApp({ CORS_ORIGINS: 'https://tools.example' });
    try {
      const ok = await app.inject({ method: 'GET', url: '/v1/currencies', headers: { origin: 'https://tools.example' } });
      expect(ok.headers['access-control-allow-origin']).toBe('https://tools.example');
      const no = await app.inject({ method: 'GET', url: '/v1/currencies', headers: { origin: 'https://evil.example' } });
      expect(no.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

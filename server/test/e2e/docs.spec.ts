import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { buildOpenApiDocument } from '../../src/docs/swagger';
import { ERROR_CATALOG, ErrorCode } from '../../src/common/errors/error-codes';
import { startApp } from '../helpers';

type Json = Record<string, any>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

describe('Swagger documentation', () => {
  let app: NestFastifyApplication;
  let spec: Json;
  beforeAll(async () => {
    app = await startApp();
    spec = buildOpenApiDocument(app) as unknown as Json;
  });
  afterAll(async () => app.close());

  const operations = () =>
    Object.entries(spec.paths as Json).flatMap(([path, item]: [string, Json]) =>
      METHODS.filter((m) => item[m]).map((m) => ({ path, method: m.toUpperCase(), op: item[m] as Json })),
    );

  it('documents exactly these endpoints', () => {
    expect(operations().map((o) => `${o.method} ${o.path}`).sort()).toEqual(
      [
        'GET /health',
        'GET /health/ready',
        'GET /v1/manifest',
        'GET /v1/currencies',
        'GET /v1/currencies/{isoCode}',
        'GET /v1/currencies/{isoCode}/facts',
        'POST /v1/scan/resolve',
        'POST /v1/ask',
        'POST /v1/feedback',
      ].sort(),
    );
  });

  it('opens with an overview, conventions and the full error table', () => {
    const d: string = spec.info.description;
    for (const heading of ['## Try it', '## What is real today', '## Conventions', '## Errors']) {
      expect(d).toContain(heading);
    }
    for (const code of Object.values(ErrorCode)) {
      expect(d).toContain(`\`${code}\` | ${ERROR_CATALOG[code].status} |`);
    }
    expect(d).toContain('No language model is connected yet');
  });

  it('gives every operation a unique id, a tag, a short summary and a real explanation', () => {
    const ids = new Set<string>();
    for (const { path, method, op } of operations()) {
      const where = `${method} ${path}`;
      expect({ where, id: op.operationId }).toEqual({ where, id: expect.stringMatching(/^[a-z][A-Za-z]+$/) });
      expect(ids.has(op.operationId)).toBe(false);
      ids.add(op.operationId);
      expect(op.tags?.length).toBe(1);
      expect({ where, ok: op.summary.length >= 10 && op.summary.length <= 70 }).toEqual({ where, ok: true });
      expect({ where, ok: op.description.length >= 120 }).toEqual({ where, ok: true });
    }
  });

  it('describes every tag', () => {
    const used = new Set(operations().flatMap((o) => o.op.tags as string[]));
    const described = new Map((spec.tags as Json[]).map((t) => [t.name, t.description as string]));
    for (const tag of used) expect(described.get(tag)?.length).toBeGreaterThan(20);
  });

  it('describes every parameter, with an example or an enum', () => {
    for (const { path, method, op } of operations()) {
      for (const p of (op.parameters ?? []) as Json[]) {
        const where = `${method} ${path} ?${p.name}`;
        expect({ where, description: Boolean(p.description) }).toEqual({ where, description: true });
        const s = p.schema ?? {};
        const hasExample =
          p.example !== undefined || s.example !== undefined || Boolean(s.enum) || s.default !== undefined;
        expect({ where, hasExample }).toEqual({ where, hasExample: true });
      }
    }
  });

  it('describes every field of every request and response model', () => {
    const missing: string[] = [];
    for (const [name, schema] of Object.entries(spec.components.schemas as Json)) {
      for (const [prop, def] of Object.entries((schema as Json).properties ?? {}) as [string, Json][]) {
        const text = def.description ?? def.allOf?.[0]?.description;
        const viaRef = def.$ref !== undefined || def.items?.$ref !== undefined;
        if (!text && !viaRef) missing.push(`${name}.${prop}`);
        if (!viaRef && def.example === undefined && def.enum === undefined && def.default === undefined && def.type !== 'array') {
          missing.push(`${name}.${prop} (no example)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('documents the standard error response on every operation, with an example per code', () => {
    for (const { path, method, op } of operations()) {
      const where = `${method} ${path}`;
      const codes = Object.keys(op.responses).filter((s) => Number(s) >= 400);
      expect({ where, has500: codes.includes('500') }).toEqual({ where, has500: true });
      if (!path.startsWith('/health')) expect({ where, has429: codes.includes('429') }).toEqual({ where, has429: true });
      for (const status of codes) {
        const content = op.responses[status].content?.['application/json'];
        expect({ where, status, ref: content?.schema?.$ref }).toEqual({ where, status, ref: '#/components/schemas/ApiError' });
        const examples = Object.values(content.examples ?? {}) as Json[];
        expect({ where, status, n: examples.length > 0 }).toEqual({ where, status, n: true });
        for (const ex of examples) {
          expect(ex.value.status).toBe(Number(status));
          expect(Object.values(ErrorCode)).toContain(ex.value.code);
          expect(ex.value.hint).toBe(ERROR_CATALOG[ex.value.code as ErrorCode].hint);
        }
      }
    }
  });

  it('documents the failure modes that can really happen on each endpoint', () => {
    const codesOf = (path: string, method: string) =>
      Object.values(spec.paths[path][method].responses as Json).flatMap((r: Json) =>
        Object.keys(r.content?.['application/json']?.examples ?? {}),
      );
    expect(codesOf('/v1/scan/resolve', 'post')).toEqual(
      expect.arrayContaining(['VALIDATION_FAILED', 'INVALID_JSON', 'UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED']),
    );
    expect(codesOf('/v1/currencies/{isoCode}', 'get')).toEqual(
      expect.arrayContaining(['CURRENCY_NOT_FOUND', 'VALIDATION_FAILED']),
    );
    expect(codesOf('/v1/currencies/{isoCode}/facts', 'get')).toEqual(
      expect.arrayContaining(['CURRENCY_NOT_FOUND', 'DENOMINATION_NOT_FOUND', 'VALIDATION_FAILED']),
    );
    expect(codesOf('/v1/manifest', 'get')).toEqual(expect.arrayContaining(['APP_UPDATE_REQUIRED']));
    expect(codesOf('/v1/ask', 'post')).toEqual(expect.arrayContaining(['CURRENCY_NOT_FOUND', 'RATE_LIMITED']));
    expect(codesOf('/health/ready', 'get').sort()).toEqual(['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);
  });

  it('shows request and response examples where the shape is not obvious', () => {
    const scan = spec.paths['/v1/scan/resolve'].post;
    expect(Object.keys(scan.requestBody.content['application/json'].examples)).toEqual([
      'clearMatch', 'oneClueOnly', 'notInCatalogue',
    ]);
    expect(Object.keys(scan.responses['200'].content['application/json'].examples)).toEqual([
      'matched', 'ambiguous', 'unknown',
    ]);
    const facts = spec.paths['/v1/currencies/{isoCode}/facts'].get;
    expect(Object.keys(facts.responses)).toEqual(expect.arrayContaining(['200', '304']));
    expect(facts.responses['200'].headers.ETag).toBeDefined();
    const ask = spec.paths['/v1/ask'].post;
    expect(ask.responses['200'].content['text/event-stream'].example).toContain('event: done');
  });

  it('keeps the examples in the docs true to what the API really returns', async () => {
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: payload as never });
    const scan = spec.paths['/v1/scan/resolve'].post;
    const bodies = scan.requestBody.content['application/json'].examples as Json;
    const expected = scan.responses['200'].content['application/json'].examples as Json;
    const pairs: Array<[string, string]> = [['clearMatch', 'matched'], ['oneClueOnly', 'ambiguous'], ['notInCatalogue', 'unknown']];
    for (const [request, response] of pairs) {
      const actual = (await post('/v1/scan/resolve', bodies[request].value)).json();
      expect(actual).toEqual(expected[response].value);
    }
  });

  it('is served as JSON and as an interactive page', async () => {
    const json = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(json.statusCode).toBe(200);
    expect(json.json().openapi).toMatch(/^3\./);
    const page = await app.inject({ method: 'GET', url: '/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
  });

  it('is not served when switched off, as in production', async () => {
    const off = await startApp({ SWAGGER_ENABLED: 'false' });
    try {
      expect((await off.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
      expect((await off.inject({ method: 'GET', url: '/openapi.json' })).statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });

  it('matches the committed openapi/openapi.json (run `npm run openapi:export` after API changes)', () => {
    const committed = JSON.parse(readFileSync(join(__dirname, '../../openapi/openapi.json'), 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(spec)));
  });
});

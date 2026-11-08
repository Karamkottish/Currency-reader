import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { AppConfig } from './config/app-config';
import { setupSwagger } from './docs/swagger';
import { API_PREFIX } from './version';

/** Largest request body accepted. Notes are text; nothing needs more. */
export const BODY_LIMIT_BYTES = 32 * 1024;

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Keeps a caller's request id if it is safe to log, otherwise makes one. */
export function requestIdFor(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && REQUEST_ID.test(value) ? value : randomUUID();
}

/**
 * Builds the application without starting it. The real server and the tests
 * both come through here, so tests exercise the exact same setup.
 */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.trustProxy,
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) =>
      requestIdFor(req.headers['x-request-id']),
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    adapter,
    { logger: config.logLevels, abortOnError: false },
  );

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
  app.useGlobalPipes(createValidationPipe());

  const fastify = adapter.getInstance();

  // Errors the web server raises before any controller runs (bad JSON, body
  // too large, wrong content type) already pass through the exception filter:
  // NestJS routes them there, and error-mapper.ts recognises each one.

  // This API speaks JSON only. Without this, Fastify would also accept
  // text/plain and form bodies and fail later with a confusing message.
  fastify.addHook('onRequest', async (req) => {
    const hasBody =
      (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') &&
      (req.headers['transfer-encoding'] !== undefined ||
        Number(req.headers['content-length'] ?? 0) > 0);
    const type = req.headers['content-type'];
    if (hasBody && type !== undefined && !/^application\/json\s*(;|$)/i.test(type)) {
      throw Object.assign(new Error('Content-Type must be application/json.'), {
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
        statusCode: 415,
      });
    }
  });

  fastify.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('x-content-type-options', 'nosniff');
  });

  const log = new Logger('Http');
  fastify.addHook('onResponse', async (req, reply) => {
    if (req.url.startsWith('/health')) return;
    const line = `${req.method} ${req.url.split('?')[0]} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms [${req.id}]`;
    if (reply.statusCode >= 500) log.error(line);
    else if (reply.statusCode >= 400) log.warn(line);
    else log.log(line);
  });

  if (config.corsOrigins.length > 0) {
    app.enableCors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['content-type', 'if-none-match', 'x-request-id'],
      exposedHeaders: ['etag', 'retry-after', 'x-request-id'],
      maxAge: 600,
    });
  }

  if (config.swaggerEnabled) setupSwagger(app);

  app.enableShutdownHooks();
  return app;
}

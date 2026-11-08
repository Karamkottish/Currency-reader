import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.setup';
import { ApiError } from '../src/common/errors/api-error.dto';
import { loadConfig } from '../src/config/app-config';

/** Starts the real application (same setup as production) without a port. */
export async function startApp(
  env: Record<string, string> = {},
): Promise<NestFastifyApplication> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    RATE_LIMIT_PER_MINUTE: '100000',
    ASK_RATE_LIMIT_PER_MINUTE: '100000',
    ...env,
  });
  const app = await createApp(config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export interface SseEvent {
  event: string;
  data: any;
}

/** Splits a text/event-stream body into its events. */
export function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

/** Every error response must look exactly like this, whatever caused it. */
export function expectErrorShape(
  res: { statusCode: number; headers: Record<string, unknown>; json: () => unknown },
  status: number,
  code: string,
): ApiError {
  const body = res.json() as ApiError;
  expect(res.statusCode).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(body).toMatchObject({ status, code, path: expect.any(String) });
  expect(typeof body.message).toBe('string');
  expect(typeof body.hint).toBe('string');
  expect(typeof body.retryable).toBe('boolean');
  expect(body.requestId).toBe(res.headers['x-request-id']);
  expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  return body;
}

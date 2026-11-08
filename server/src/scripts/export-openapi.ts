import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from '../app.setup';
import { loadConfig } from '../config/app-config';
import { buildOpenApiDocument } from '../docs/swagger';

/**
 * Writes the OpenAPI spec to openapi/openapi.json without starting a server.
 * The file is committed, so changes to the API show up in code review and
 * the Flutter app can generate or check its client against it.
 */
async function main(): Promise<void> {
  const app = await createApp(
    loadConfig({ NODE_ENV: 'test', SWAGGER_ENABLED: 'false', LOG_LEVEL: 'fatal' }),
  );
  await app.init();
  const document = buildOpenApiDocument(app);
  const target = resolve(__dirname, '../../openapi/openapi.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${target}`);
}

void main();

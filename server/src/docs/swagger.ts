import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ERROR_CATALOG } from '../common/errors/error-codes';
import { APP_VERSION } from '../version';

const errorTable = [
  '| Code | HTTP | Retry? | Meaning |',
  '|---|---|---|---|',
  ...Object.entries(ERROR_CATALOG).map(
    ([code, i]) =>
      `| \`${code}\` | ${i.status} | ${i.retryable ? 'yes' : 'no'} | ${i.summary} |`,
  ),
].join('\n');

const DESCRIPTION = `
The HTTP API behind the **Currency Reader** app. The phone reads a banknote with its camera and OCR, then uses this API to find out which currency it is, fetch sourced facts about it, and answer questions.

## Try it
Use **Try it out** on any endpoint below. For a first look:

1. \`GET /v1/currencies\`: see what the catalogue holds.
2. \`POST /v1/scan/resolve\` with the example body: it names a currency from OCR text.
3. \`GET /v1/currencies/EUR/facts\`: read the facts; copy the \`ETag\` and send it back as \`If-None-Match\` to see \`304\`.
4. \`POST /v1/ask\`: stream an answer. (The docs page can show only the final text; \`curl -N\` shows it arriving.)

\`\`\`bash
curl -s localhost:3000/v1/scan/resolve -H 'content-type: application/json' \\
  -d '{"lines":["EUROPEAN CENTRAL BANK","EURO","20"]}'

curl -N localhost:3000/v1/ask -H 'content-type: application/json' \\
  -d '{"question":"What colour is the 20 euro note?","isoCode":"EUR"}'
\`\`\`

## What is real today
| Part | State |
|---|---|
| Endpoints, validation, errors, rate limits | Working and tested. |
| Catalogue | A small hand-written starter set (4 currencies). Every fact is marked \`unverified\`. Held in memory; a database replaces it later. |
| Answers (\`/v1/ask\`) | Quote the best matching facts. **No language model is connected yet.** |
| Looking up currencies that are not in the catalogue | Not built. \`/v1/scan/resolve\` answers \`unknown\`. |
| Exchange rates | Not built. |
| Feedback storage | In memory only; lost on restart. |

## Conventions

**Versioning.** Endpoints live under \`/v1\`. A breaking change gets \`/v2\`; \`/v1\` keeps working. Health checks are not versioned.

**Content type.** Requests with a body must send \`Content-Type: application/json\`. Bodies are limited to 32 KB. The API never accepts images.

**Unknown fields are rejected.** A misspelled field returns \`VALIDATION_FAILED\` instead of being ignored, so mistakes show up while developing.

**Request ID.** Every response has an \`x-request-id\` header, and every error body repeats it as \`requestId\`. You may send your own \`x-request-id\` (letters, digits, \`-\` and \`_\`, up to 64 characters); otherwise one is generated. Quote it when reporting a problem.

**Rate limits.** 60 requests per minute per client address, and 10 per minute on \`/v1/ask\`. Over the limit, the answer is \`429 RATE_LIMITED\` with a \`Retry-After\` header in seconds. The health checks are exempt.

**Caching.** Facts carry an \`ETag\`. Send it back in \`If-None-Match\` to get \`304 Not Modified\` when nothing has changed.

## Errors
Every failure, from any endpoint, has the same JSON body:

\`\`\`json
{
  "status": 404,
  "code": "CURRENCY_NOT_FOUND",
  "message": "No currency with the code 'XYZ'.",
  "hint": "List the supported codes with GET /v1/currencies.",
  "retryable": false,
  "requestId": "8f14e45f-ceea-467a-9575-1c9d0b1f0a11",
  "timestamp": "2026-11-08T10:15:30.000Z",
  "path": "/v1/currencies/XYZ"
}
\`\`\`

- **Branch on \`code\`**, never on \`message\`: the code is stable, the wording may change.
- \`retryable\` says whether the same request may succeed later. If false, change the request.
- \`details\` appears for \`VALIDATION_FAILED\` and lists each bad field.
- Server faults (\`INTERNAL_ERROR\`) never include internal detail; use \`requestId\` to find them in the log.

${errorTable}
`.trim();

const TAGS: Array<[string, string]> = [
  ['Health', 'Is the server up, and is it ready for traffic? Used by monitors and load balancers.'],
  ['Manifest', 'What data version is current, and is this app version still supported?'],
  ['Currencies', 'The catalogue: currencies, their denominations and sourced facts.'],
  ['Scan', 'Turn the text the phone read from a note into a currency.'],
  ['Ask', 'Ask a question and get a streamed answer built from sourced facts.'],
  ['Feedback', 'Tell us when the app was wrong, so the catalogue can improve.'],
];

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Currency Reader API')
    .setDescription(DESCRIPTION)
    .setVersion(APP_VERSION)
    .addServer('http://localhost:3000', 'Local development');
  for (const [name, description] of TAGS) builder.addTag(name, description);

  return SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (_controller, method) => method,
  });
}

/** Mounts the interactive docs at /docs and the raw spec at /openapi.json. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'Currency Reader API',
    swaggerOptions: {
      displayRequestDuration: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      tryItOutEnabled: true,
    },
  });
}

# Currency Reader API

The HTTP API behind the app: it names a currency from the text the phone read, serves sourced facts about it, and answers questions from those facts. NestJS 11 on Fastify, with OpenAPI (Swagger) documentation generated from the code.

## Run it

Needs Node 20 or newer.

```bash
cd server
npm install
npm run start:dev      # rebuilds on change
```

Then open **http://localhost:3000/docs** for the interactive documentation. The raw spec is at `/openapi.json` and a committed copy is in [openapi/openapi.json](openapi/openapi.json).

```bash
npm test               # 100+ tests: units, every endpoint, every error, the docs
npm run build && npm start
npm run openapi:export # rewrite openapi/openapi.json after changing the API
```

## Endpoints

| Method and path | What it does |
|---|---|
| `GET /health` | Is the process up? |
| `GET /health/ready` | Can it take traffic? 503 if a dependency is down |
| `GET /v1/manifest` | Newest data version; 426 if the app is too old |
| `GET /v1/currencies` | List and search the catalogue, with paging |
| `GET /v1/currencies/{isoCode}` | One currency and its denominations |
| `GET /v1/currencies/{isoCode}/facts` | Sourced facts. `ETag` and `If-None-Match` give a cheap `304` |
| `POST /v1/scan/resolve` | OCR text in, currency out (`matched`, `ambiguous` or `unknown`) |
| `POST /v1/ask` | Question in, streamed answer out (server-sent events) |
| `POST /v1/feedback` | Report a wrong or missing result |

Every endpoint is explained in `/docs`, with request examples, response examples and every error it can return.

## Errors

Every failure has one body shape, from any endpoint:

```json
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
```

Branch on `code`, not `message`. The full code table is at the top of `/docs` and in [src/common/errors/error-codes.ts](src/common/errors/error-codes.ts), which is the single source for the table, the hints, the statuses and the tests.

How errors are kept uniform:

- Services throw `AppException(code, message)`. One filter turns it into the body above.
- Errors from the web server itself (broken JSON, body over 32 KB, wrong content type) go through the same mapper.
- Anything unexpected becomes `INTERNAL_ERROR` with no detail in the response. The cause and stack go to the server log, tagged with the same `requestId` the caller sees.
- Unknown request fields are rejected, not ignored.
- A failure after a stream has started is sent as an `error` event, because the status is already 200.

## Settings

All optional; see [.env.example](.env.example). A wrong value stops the server at start-up and lists every problem.

| Variable | Default | Meaning |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3000` | Where to listen. Use `0.0.0.0` in a container. |
| `NODE_ENV` | `development` | `production` turns the docs off unless `SWAGGER_ENABLED=true`. |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per client address. |
| `ASK_RATE_LIMIT_PER_MINUTE` | `10` | Extra limit on `/v1/ask`. |
| `CORS_ORIGINS` | none | Browser origins allowed to call the API. The app does not need it. |
| `TRUST_PROXY` | `false` | Read the client address from `X-Forwarded-For`. Only behind a proxy you control. |

## What is real, and what is a stand-in

| Part | State |
|---|---|
| Endpoints, validation, errors, rate limits, docs | Working and tested |
| Catalogue | 4 currencies written by hand, every fact marked `unverified`, held in memory. A repository interface lets Postgres replace it. |
| `/v1/ask` | Quotes the best matching facts. **No language model is connected**; the `LlmService` interface is where `llama-server` plugs in. |
| Currencies not in the catalogue | Not looked up. `/v1/scan/resolve` answers `unknown`. |
| Exchange rates | Not built |
| Feedback | Kept in memory, newest 1,000 |

## Before this faces the internet

Not done yet, on purpose:

- **No authentication.** Anyone who can reach it can use it. Add JWT before opening it up.
- **No TLS.** Put it behind a reverse proxy (Caddy or Nginx) that terminates HTTPS.
- **Rate limits are per process and in memory.** Behind several instances they need Redis or Valkey.
- **Security headers** beyond `nosniff` (a `helmet`-style set) are not added.

## Layout

```
src/
  main.ts, app.setup.ts     start-up; the same setup is used by the tests
  app.module.ts             wiring and rate limits
  config/                   settings, checked at start
  common/
    errors/                 codes, exception, mapper, the documented error body
    filters/, pipes/        the exception filter, request validation
    swagger/                helpers that document error responses
  docs/swagger.ts           the top-of-page overview and the tag descriptions
  modules/
    catalog/                currencies and facts (in-memory for now)
    health, manifest, currencies, scan, ask, feedback
test/                       unit tests, endpoint tests, documentation tests
openapi/openapi.json        the generated spec, committed
```

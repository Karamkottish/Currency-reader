# Backend — Structure and State Management
*NestJS (Fastify) modular monolith + Postgres/pgvector + Valkey/Redis + `llama-server` + Python worker.*
*Written 5 Nov 2026. This is architecture guidance from general knowledge, not from the earlier package research. Verify versions and flags before using them.*

---

## 1. Architecture Decision

**Modular monolith**: one NestJS application with strictly separated modules, plus a few supporting processes.

| Process | Role |
|---|---|
| `api` (NestJS + Fastify) | All business logic, one deployable |
| `llama-server` | Small language model (separate C++ program) |
| `postgres` + pgvector | Rows, full-text, vectors |
| `valkey` (or Redis) | Cache, rate limits, queue |
| `worker` (Python) | Ingestion, embeddings, pack building, training jobs |

Why not microservices: in-process calls are faster than HTTP, and you avoid distributed debugging and many deployments. Split a module out only when measurements force it.

---

## 2. Principles

1. **The API is stateless.** Any instance can serve any request. No user or conversation data lives in process memory between requests.
2. **State has a home.** Every piece of state lives in exactly one named place (section 4).
3. **Modules own their data.** Another module calls an exported service; it never queries your tables.
4. **One-way dependencies.** `ask → retrieval, llm, cache`; `retrieval → facts, embeddings`. No cycles.
5. **External systems sit behind interfaces** (`LlmService`, `EmbeddingsService`, `StorageService`).
6. **Heavy work goes to the queue**, never inside a request.
7. **The hot path stays lean:** cache check, one retrieval query, one streamed model call.

---

## 3. Folder Structure

```
server/
├── src/
│   ├── main.ts                       # Fastify adapter, global pipes, shutdown hooks
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── configuration.ts          # typed config from env
│   │   └── env.validation.ts         # fail fast if env is wrong
│   │
│   ├── common/
│   │   ├── guards/                   # JwtAuthGuard, RolesGuard, ThrottleGuard
│   │   ├── filters/                  # global exception filter
│   │   ├── interceptors/             # logging, timing, request-id
│   │   ├── pipes/                    # validation
│   │   ├── decorators/
│   │   └── types/                    # shared types, Result, error codes
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── dto/
│   │   ├── currencies/               # CRUD: currencies, denominations
│   │   ├── facts/                    # facts, sources, versions
│   │   ├── retrieval/
│   │   │   ├── retrieval.module.ts
│   │   │   ├── retrieval.service.ts  # hybrid search + RRF
│   │   │   ├── rerank.service.ts     # optional
│   │   │   └── queries/              # raw SQL builders
│   │   ├── ask/
│   │   │   ├── ask.controller.ts     # POST /v1/ask (SSE)
│   │   │   ├── ask.service.ts        # orchestration
│   │   │   ├── prompt.builder.ts
│   │   │   └── citation.parser.ts
│   │   ├── llm/
│   │   │   ├── llm.service.ts        # OpenAI-compatible client to llama-server
│   │   │   └── llm.types.ts
│   │   ├── embeddings/
│   │   │   └── embeddings.service.ts # client to embedding server
│   │   ├── cache/
│   │   │   ├── cache.service.ts      # answer cache, keys, TTLs
│   │   │   └── cache.keys.ts
│   │   ├── ingestion/
│   │   │   ├── ingestion.controller.ts
│   │   │   ├── ingestion.service.ts  # enqueue + job status
│   │   │   └── dto/
│   │   ├── packs/
│   │   │   ├── packs.controller.ts   # POST build, GET status
│   │   │   ├── packs.service.ts
│   │   │   └── manifest.service.ts   # GET /v1/manifest
│   │   ├── artifacts/                # model/pack records, rollout %, versions
│   │   ├── feedback/
│   │   └── health/                   # liveness, readiness, metrics
│   │
│   └── infrastructure/
│       ├── database/
│       │   ├── prisma.service.ts
│       │   └── raw-sql.service.ts    # pgvector queries
│       ├── queue/
│       │   ├── queue.module.ts       # BullMQ connection
│       │   └── queue.names.ts
│       ├── redis/
│       │   └── redis.module.ts
│       └── storage/
│           └── storage.service.ts    # S3/MinIO client
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── sql/
│   ├── 001_extensions.sql            # CREATE EXTENSION vector
│   ├── 002_vector_index.sql          # HNSW index
│   └── 003_fulltext.sql              # tsvector + GIN
├── test/
│   ├── unit/
│   ├── integration/                  # with Docker Postgres + Valkey
│   └── e2e/
├── Dockerfile
└── package.json

worker/                               # Python
├── app/
│   ├── main.py                       # queue consumer
│   ├── jobs/
│   │   ├── ingest.py
│   │   ├── embed.py
│   │   ├── build_pack.py
│   │   └── train.py                  # optional training jobs
│   ├── parsers/
│   ├── chunking.py
│   ├── embedding.py
│   ├── pack_builder.py               # SQLite + FTS5 + vec0 output
│   └── storage.py
├── tests/
├── requirements.txt
└── Dockerfile

infra/
├── docker-compose.yml
├── caddy/Caddyfile
└── models/                           # .gguf files (never committed to Git)
```

### Module anatomy (every module looks the same)

```
modules/<name>/
├── <name>.module.ts       # imports, providers, exports
├── <name>.controller.ts   # HTTP only: parse, call service, return
├── <name>.service.ts      # business logic
├── dto/                   # request/response shapes + validation
├── entities or types/
└── <name>.service.spec.ts # unit test next to the code
```

Controllers stay thin. Services never import `Request` or `Response`.

---

## 4. "State Management" on the Backend: Where Every Piece of State Lives

**Definition.** On a stateless server, *state management* means deciding which store holds each piece of data, how long it lives, who may change it, and how conflicts are avoided.

| State | Home | Lifetime | Notes |
|---|---|---|---|
| Currencies, denominations, facts, sources | **Postgres** | permanent | Source of truth |
| Vector embeddings | **Postgres (pgvector)** | permanent | Must match the app's embedding model and version |
| Pack and model records, rollout % | **Postgres** (`artifacts`) | permanent | Drives the manifest |
| Pack and model files | **Object storage (MinIO/R2)** | permanent, immutable | Named by version and hash |
| Answer cache | **Valkey** | TTL (e.g. 1-24 h) | Keyed by data version, so updates invalidate it |
| Rate-limit counters | **Valkey** | seconds to minutes | Atomic increments |
| Job queue and job state | **Valkey (BullMQ)** | until completed + retention | Plus a job row in Postgres for history |
| Sessions / refresh tokens | **Postgres** (or Valkey with TTL) | token lifetime | Access JWTs are stateless |
| In-flight SSE stream | **API process memory** | one request | Tied to one connection; cancel on disconnect |
| Model server slots | **`llama-server` memory** | one request | Limited by `--parallel` |
| Config | **Environment variables** | process lifetime | Validated at start |
| Logs, metrics, traces | **Observability stack** | retention policy | Not business state |

**Rule:** if two API instances would disagree about something, it belongs in Postgres or Valkey, not in memory.

---

## 5. Request-Scoped State

Per request, carry a small context object (set by an interceptor):

```ts
interface RequestContext {
  requestId: string;       // for log correlation
  userId?: string;
  startedAt: number;       // for timing
  timings: Record<string, number>; // cache, retrieval, ttft, total
}
```

Use NestJS request-scoped providers sparingly (they have a performance cost). Prefer passing the context explicitly or using `AsyncLocalStorage`.

---

## 6. The Hot Path in Detail (`POST /v1/ask`)

```
1. validate DTO                       (pipe)
2. build cache key                    cache.keys: ask:{dataVersion}:{hash(normalizedQuestion)}:{currencyId}
3. cache.get(key)
     hit  -> stream cached text, done
4. retrieval.search(question)         ONE Postgres round-trip (keyword + vector, merged with RRF)
5. prompt.build(facts[0..4])          identical system prompt first (prefix cache)
6. llm.stream(prompt)                 SSE from llama-server
7. forward tokens -> client SSE       abort if client disconnects
8. citation.parse(answer)             [n] markers -> fact ids/sources
9. cache.set(key, answer, ttl)
10. record timings, return
```

### SSE streaming with cancellation

```ts
@Sse('ask')           // or a POST handler returning an Observable/stream
ask(@Body() dto: AskDto, @Req() req): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const abort = new AbortController();
    req.raw.on('close', () => abort.abort());          // client left: stop generating

    this.askService.run(dto, abort.signal, (event) => subscriber.next(event))
      .then(() => subscriber.complete())
      .catch((e) => subscriber.error(e));

    return () => abort.abort();                         // cleanup on unsubscribe
  });
}
```

Cancelling the upstream call to `llama-server` when the client disconnects frees a slot immediately. Without this, abandoned requests keep the model busy.

---

## 7. Cache State

- **Key design:** `ask:{dataVersion}:{questionHash}:{currencyId}`. Because `dataVersion` is in the key, publishing a new pack automatically makes old entries unreachable. No manual invalidation needed.
- **Normalization before hashing:** lowercase, trim, collapse spaces, strip punctuation. (Optionally add a semantic cache later: embed the question and reuse an answer if a stored question is very close.)
- **TTL:** set one; never cache forever.
- **Stampede protection:** when many identical requests miss at once, let one compute and the others wait (a short lock key with `SET NX PX`).
- **Do not cache** answers flagged as "no information" for long, because new facts may fill the gap.

---

## 8. Queue and Job State Machine

For ingestion and pack builds (BullMQ + Python worker):

```
queued -> active -> (embedding) -> (building) -> uploading -> completed
                \-> failed (retry with backoff, max N) -> dead-letter
```

Rules:
1. **Idempotent jobs.** Running the same job twice gives the same result (use a deterministic job id such as `pack:{version}`).
2. **Persist job history** in a Postgres `jobs` table: id, kind, status, started, finished, error, input hash.
3. **Retries with exponential backoff**, then a dead-letter state you can inspect.
4. **Progress reporting:** the worker updates progress; the admin UI polls `GET /v1/jobs/:id` (or uses SSE).
5. **One build at a time per pack kind** (a lock) so two builds never publish the same version.
6. **Never block a request on a job.** Return `202 Accepted` with a job id.

### Pack publishing as a state machine (in Postgres)

```
draft -> building -> built -> published -> (superseded | rolled_back)
```

Only `published` packs appear in the manifest. Rollback means marking the previous pack `published` again; files are immutable, so nothing is re-uploaded.

---

## 9. Database State

- **Prisma** for ordinary CRUD; **raw SQL** for hybrid search and vector queries (Prisma has no native vector type: declare `Unsupported("vector(256)")`).
- **Transactions** for multi-row changes (fact + its embedding + its version bump).
- **Facts are versioned.** Never overwrite silently: add a new version row or bump `version`, and keep `source`.
- **Embedding consistency:** store `embed_model` and `embed_dim` per pack and per row batch. Refuse to mix.
- **Indexes:** HNSW on the vector column, GIN on the `tsvector` column, and ordinary indexes on foreign keys.
- **Connection pooling** (PgBouncer or Prisma's pool) sized to your core count; too many connections slows Postgres.
- **Migrations** only through Prisma migrate plus the `sql/` files, applied in order and committed.

---

## 10. Manifest and Rollout State

`GET /v1/manifest?platform=android&tier=A&appVersion=1.4.0` returns the newest compatible artifacts:

```json
{
  "datapack": { "version": "2026.11.05-1", "url": "...", "sha256": "...", "embedModel": "...", "dim": 256 },
  "models": [ { "kind": "slm", "tier": "A", "version": "1", "url": "...", "sha256": "...", "size": 0 } ],
  "classifier": { "version": "2", "url": "...", "sha256": "..." }
}
```

- `artifacts` table fields: `kind, platform, tier, version, url, sha256, size, min_app_version, rollout_pct, status`.
- **Staged rollout:** the app sends a stable install id; the server hashes it into a bucket 0-99 and serves the new version only if `bucket < rollout_pct`.
- Make the manifest **cacheable** (short TTL or ETag), because many apps will call it.

---

## 11. Model Server State (`llama-server`)

- One long-running process; the model stays loaded.
- `--parallel N` creates N slots; each slot has its own context share. Set N to your expected concurrency, not higher.
- Keep the **system prompt identical at the start** of every request so the prefix cache is reused.
- Your `LlmService` should:
  - limit concurrent calls (a semaphore equal to N, plus a small queue)
  - apply a **timeout**
  - return a clear "busy" error when the queue is full (HTTP 429/503) instead of waiting forever
  - expose a health check (a tiny request) for readiness
- Bind to `127.0.0.1` only. Never expose it publicly.

---

## 12. Auth and Security State

- Short-lived **access JWT** (stateless) + **refresh token** stored hashed in Postgres with expiry and revocation.
- Rate limits per user and per IP in Valkey (token bucket or sliding window).
- Validate every DTO; reject unknown fields.
- Secrets only from environment or a secret manager; never in Git.
- Admin endpoints (ingestion, packs) behind a separate role.
- Log request ids, never raw question text with personal data unless the user consented.

---

## 13. Configuration and Startup State

- Load config once, validate with a schema, and **fail fast** with a clear message.
- **Readiness vs liveness:**
  - liveness: process is up
  - readiness: Postgres reachable, Valkey reachable, `llama-server` healthy, embedding server healthy
- Graceful shutdown: stop accepting requests, let in-flight SSE streams finish (with a deadline), close queue and DB connections, then exit.

---

## 14. Observability

- **Structured logs** (JSON) with `requestId`.
- **Timings per request:** cache, retrieval, prompt build, time to first token, total. These tell you where milliseconds go.
- **Metrics:** requests/s, cache hit rate, queue depth, slot usage, TTFT percentiles, error rate.
- **LLM tracing** with a tool such as Langfuse (optional): question, retrieved facts, answer, latency.
- **Alerts:** readiness failing, queue depth growing, TTFT p95 above target, dead-letter jobs.

---

## 15. Testing Strategy

| Level | What | How |
|---|---|---|
| Unit | prompt builder, citation parser, cache key, RRF merge, rollout bucketing | Jest, pure functions |
| Service | `AskService` with fake `LlmService` and fake `RetrievalService` | Nest testing module |
| Integration | retrieval SQL, vector index, queue | Docker Postgres + Valkey in CI |
| E2E | `/v1/ask` streaming, manifest, auth | supertest against the app |
| Load | concurrent `/v1/ask` | k6 or autocannon; watch slot queueing and TTFT |
| Retrieval quality | hit rate on an evaluation question set | script run after every data or model change |

Write the fake `LlmService` first; it lets you test everything without a model.

---

## 16. Docker Compose Layout (development)

```yaml
services:
  api:
    build: ./server
    env_file: ./server/.env
    depends_on: [db, cache, llm]
    ports: ["3000:3000"]
  db:
    image: pgvector/pgvector:pg16
    environment: { POSTGRES_PASSWORD: change_me, POSTGRES_DB: currency }
    volumes: [pgdata:/var/lib/postgresql/data]
  cache:
    image: valkey/valkey:latest
  llm:
    # llama.cpp server image or a local build; flags change between releases
    command: ["llama-server","-m","/models/model.gguf","--host","0.0.0.0","--port","8080","-c","4096","--parallel","2"]
    volumes: ["./infra/models:/models:ro"]
  worker:
    build: ./worker
    depends_on: [db, cache]
volumes: { pgdata: {} }
```

(In production, do not publish the `llm`, `db` or `cache` ports; keep them on an internal network.)

---

## 17. Build Order for This Structure

1. `config`, `common`, `infrastructure/database`, Prisma schema, SQL files
2. `currencies` + `facts` CRUD
3. `embeddings` + `retrieval` (hybrid query), with an evaluation script
4. `llm` + `ask` (non-streaming first, then SSE)
5. `cache`
6. `queue` + `ingestion` + Python worker
7. `packs` + `artifacts` + `manifest`
8. `auth`, rate limits, `health`
9. Observability and load tests

---

## 18. Common Mistakes to Avoid

- Keeping conversation or user state in API memory (breaks with more than one instance).
- Doing ingestion or embedding inside a request.
- Letting modules query each other's tables.
- Forgetting to cancel the model call when the client disconnects.
- Mixing embedding models or versions between the pack and the app.
- Caching without a data version in the key.
- Exposing `llama-server`, Postgres or Valkey to the internet.
- Setting `--parallel` far above what the hardware can serve, which makes every request slow.
- Skipping the evaluation set, so you cannot tell whether a change helped.

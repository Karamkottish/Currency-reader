# Flutter Currency App — Build-By-Hand Guide
*On-device OCR + small language model (SLM) + RAG over your own currency data*
*Written 5 Nov 2026. Package names and versions move fast: verify each on pub.dev before you start.*

---

## 0. The Idea in One Line

> **Vision decides, database knows, SLM speaks.**

| Layer | Job | Tool |
|---|---|---|
| Vision | Identify which note/coin it is | Small classifier (LiteRT, INT8) |
| OCR | Read serial number / text | ML Kit → later fine-tuned PP-OCRv5 |
| Database | Hold the currency facts | SQLite + FTS5 + sqlite-vec |
| SLM | Phrase the answer from retrieved facts | Gemma 4 E2B on LiteRT-LM (fallback: Gemma 3 270M) |
| Backend | Add currencies without an app release | NestJS + Prisma + MySQL + CDN + Python worker |

**Key rule:** the model does **not** "learn" currencies by training. New knowledge = new rows in the database (RAG). It is faster to update, more accurate, and needs no retraining.

---

## 1. Definitions (read once)

- **OCR**: pixels → text. Usually *detector* (finds boxes) + *recognizer* (reads each box).
- **Classifier**: one label per image ("USD_20_front").
- **SLM**: language model of ~0.1B–4B parameters, small enough for a phone.
- **Quantization**: storing weights in fewer bits (INT8/INT4) → smaller and faster.
- **Prefill vs decode**: prefill reads your prompt (sets *time-to-first-token*); decode writes the answer (sets *tokens/sec*).
- **RAG**: look up facts first, paste them into the prompt, make the model answer only from them.
- **Embedding**: a vector of numbers representing meaning; similar meaning = nearby vectors.
- **FFI**: Dart calls C/C++ directly (fast, in-process). **Isolate**: Dart's background thread. Run all heavy inference in isolates.

---

## 2. Setup Checklist

- [ ] Flutter stable (3.44+), Android Studio, Xcode (for iOS)
- [ ] Two or more **real phones** (one flagship, one mid/low-end). Emulators lie about speed.
- [ ] Python 3.11+ with a virtualenv (for training/embedding scripts)
- [ ] Node 20+ (NestJS backend)
- [ ] Hugging Face account (to download model files)
- [ ] 15–20 GB free disk (models + datasets)

---

## 3. Phase 0 — Spike (1–2 weeks)

**Goal:** prove camera → ID → answer in under ~2 seconds on a flagship phone.

### 3.1 Create the project
```bash
flutter create currency_ai
cd currency_ai
flutter pub add camera google_mlkit_text_recognition flutter_litert sqlite3 path_provider
flutter pub add flutter_gemma   # check pub.dev: it is now modular (flutter_gemma_litertlm, _embeddings, _rag_sqlite)
```

### 3.2 Camera + ML Kit OCR
1. Open the camera with the `camera` plugin, preview at 720p.
2. Process **every 2nd–3rd frame**, keeping only the latest frame (drop the rest).
3. Convert the frame to `InputImage`, call `TextRecognizer(script: TextRecognitionScript.latin)`.
4. Show the raw text on screen. Crop to a rectangle (a fixed guide box) so you OCR only the serial area.

### 3.3 Tiny hard-coded database
Create `assets/seed.sqlite` with 3–5 currencies (schema in section 6). Open it with `sqlite3` + `path_provider`.

### 3.4 First SLM test
1. Download a model from the Hugging Face `litert-community` org:
   - Gemma 4 E2B `.litertlm` (about 2.6 GB), **or**
   - a small Gemma 3 270M build for a quick test.
2. Load it through `flutter_gemma` and stream tokens into a `Text` widget.
3. Use this prompt template:

```
System: You are a currency facts assistant. Answer ONLY from FACTS.
If the answer is not in FACTS, say "I don't have that information yet."
FACTS:
[1] ...
User: ...
```
4. **Measure** on each phone: time-to-first-token, tokens/sec, RAM.

**Exit criterion:** you know which of your devices get GPU acceleration, and camera → answer < ~2 s on the best one.

---

## 4. Phase 1 — MVP (4–8 weeks)

### 4.1 Currency identification model
1. Collect images: a few hundred per **class side** (e.g. `EUR_20_front`, `EUR_20_back`), varied lighting, angles, backgrounds, folded/worn notes. Check your country's rules on photographing banknotes.
2. Train in Python with transfer learning (MobileNetV3-Small or EfficientNet-Lite0, 224×224).
3. Export to LiteRT (`.tflite`), quantize to **full INT8** using a calibration set of ~200 images.
4. Load with `flutter_litert` inside a **background isolate**; try GPU delegate (Android) / Core ML or Metal (iOS).
5. Output: `currency_id` + confidence. Below your threshold → ask the user to re-aim.

### 4.2 OCR post-processing (this is what makes ML Kit good enough)
1. The classifier tells you *which* note, so you know where the serial number sits → crop that region.
2. Run OCR on the crop only.
3. Validate with a per-currency **regex** (e.g. `^[A-Z]{2}\d{8}$`) and check-digit rules if the issuer has them.
4. Accept only when **N consecutive frames agree** (temporal voting). Then stop the camera loop (saves battery).

### 4.3 Knowledge database (the "learning" part)
Retrieval has three layers, fastest first:
1. **Exact lookup** by `currency_id` (~0.1 ms) — most questions after a scan are about *that* note.
2. **FTS5 keyword search** (~1 ms) for typed names/years/features.
3. **Vector search with sqlite-vec** (a few ms) for paraphrased questions.

Embeddings: **EmbeddingGemma**, truncated to **256 dimensions**. Compute document embeddings **on the server** with the *same model and version* the app uses for queries. The phone only embeds the user's question.

### 4.4 Backend (your home turf)
```
Next.js admin UI → NestJS API → MySQL (Prisma)
                      ├─ GET  /v1/manifest   (latest model + datapack versions)
                      ├─ POST /v1/feedback   (misreads, unanswered questions)
                      └─ enqueue → BullMQ/Redis → Python worker
                                                  - embed new facts
                                                  - build SQLite pack
                                                  - upload to S3/R2 → CDN
```
Suggested Prisma table:
```
model_artifacts(id, kind, platform, tier, version, url, sha256, size, min_app_version, rollout_pct)
```

### 4.5 Device tiers
| Tier | Device | Behaviour |
|---|---|---|
| A | 6 GB+ RAM, working GPU/NPU | Gemma 4 E2B |
| B | ~4 GB RAM or no usable GPU | Gemma 3 270M (INT4) |
| C | very old | Templated answers + keyword search, no model |

**Check the real backend at runtime.** Some Android GPUs (notably Mali) can silently fall back to CPU. Read back the active backend and route those phones to Tier B.

### 4.6 Model download UI
- Never bundle the SLM in the APK/IPA.
- Offer an optional download, Wi-Fi preferred, with progress, resume, and **SHA-256 verification**.
- Android needs a foreground service for big downloads.
- Keep the app usable in Tier B/C while the big model downloads.

**Exit criterion:** add a currency in the admin UI and see it in the app within minutes, with no store release.

---

## 5. Phase 2 — Accuracy and Scale

- [ ] Replace the fixed classifier with **visual-embedding nearest-neighbour**: store reference-photo embeddings in the pack; a new currency then needs only photos, not retraining.
- [ ] Fine-tune the **PP-OCRv5 mobile recognizer** (not the detector) on serial crops:
  - generate synthetic serials (fonts similar to the notes + blur, perspective, glare, colour noise) plus a few hundred real crops
  - export to ONNX or LiteRT, quantize INT8
  - ship as a downloadable model
- [ ] Feedback loop: wrong-ID and misread reports become new training data.
- [ ] Optional: one-time LoRA **style-tune** of Gemma 3 270M so it follows your answer format (facts still come from RAG).

## 6. Data Model (SQLite pack)

```sql
currencies(id, iso_code, country, name, symbol, issuer, active, updated_at)
denominations(id, currency_id, kind, value, series, introduced, material, size_mm, image_ref)
facts(id, denomination_id, currency_id, lang, title, body, source, version)
-- FTS5 virtual table over facts.title, facts.body
-- vec0 virtual table: (fact_id, embedding float[256])
visual_refs(denomination_id, side, embedding float[N])
pack_meta(pack_version, embed_model, embed_dim, created_at, sha256)
```

## 7. Adding a New Currency (the repeatable loop)

1. Enter currency, denominations, facts in the admin panel.
2. Upload 5–20 reference photos per note side.
3. Python worker embeds facts and images, rebuilds the SQLite pack, computes SHA-256, uploads to the CDN.
4. Bump `pack_version` in the manifest.
5. App checks the manifest on launch (or every 24 h), downloads in the background, verifies the hash, **swaps atomically** (write temp file, then rename).
6. Live. No retraining, no release.

---

## 8. Performance Checklist

1. All inference in **long-lived background isolates**; pass image bytes as `TransferableTypedData`.
2. **Warm up** models at startup with a dummy inference; enable GPU kernel caching.
3. **Verify the accelerator** is really in use.
4. Quantize everything (INT8 vision, INT4/mixed SLM); prefer QAT checkpoints.
5. Downscale to the model input; convert YUV→RGB natively, not in Dart loops.
6. **Crop before OCR**: the biggest single OCR speed-up and an accuracy boost.
7. Keep prompts short: top 3–5 facts, about 300–800 tokens.
8. **Stream tokens** to the UI (`Stream<String>`).
9. Cache answers by `(currency_id, normalized_question, pack_version)`; precompute "about this note" summaries into the pack.
10. Cap context at 2K–4K tokens.
11. Unload the SLM when backgrounded on low-RAM phones.
12. Log TTFT, tok/s and OCR accuracy per device model.

**Rough reference speeds (Google's flagship figures):** Gemma 4 E2B on GPU ≈ 52–56 tok/s, ~0.3 s time-to-first-token on an S26 Ultra / iPhone 17 Pro. Mid-range CPU-only runs are far slower (a few tok/s), so tier your devices.

---

## 9. Pitfalls and Risks

- **Firebase ML is being shut down (15 Jun 2027).** Do not use `firebase_ml_model_downloader`. Host models on your own CDN.
- **Ultralytics YOLO is AGPL-3.0.** A closed-source app needs a paid licence; Apache-licensed detectors exist (e.g. PP-PicoDet, RT-DETR).
- **Licences:** Gemma 4 is Apache 2.0; Gemma 3 and EmbeddingGemma use the Gemma Terms of Use. Read them.
- **Store rules:** model weights are data (OK to download), but native runtimes (`.so`) must ship inside the app binary.
- **Legal:** some countries restrict reproducing banknote images; do not market the app as a counterfeit detector.
- **Hallucination:** small models invent facts. Always ground answers in FACTS and force "I don't have that information yet."
- **Ecosystem churn:** `flutter_gemma` and LiteRT-LM change fast. Pin versions and wrap the engine behind your own `InferenceEngine` interface, with llama.cpp/GGUF as a swap-in fallback.
- **Download size:** Gemma 4 E2B is ~2.6 GB, so make it optional.

---

## 10. Roadmap Tracker

- [ ] **Phase 0**: camera + ML Kit + seed DB + SLM spike, measured on real phones
- [ ] **Phase 1**: classifier, data pack, NestJS CMS + manifest, CDN, tiers, download UI
- [ ] **Phase 2**: embedding-based ID, custom PP-OCR recognizer, feedback loop, optional LoRA style-tune
- [ ] **Phase 3**: NPU-specific builds (Play AI packs / Apple Background Assets), OS built-in models, optional server fallback

---

## 11. "By Hand" Track (minimal outside libraries)

*From general knowledge, not fresh research. Benchmark on your own phones.*

You can hand-build the parts that give you control, and keep thin engine libraries only where speed comes from hardware.

| Component | By hand? | Cost of doing it by hand |
|---|---|---|
| Facts database | Yes, easy (JSON/binary file; SQLite optional) | Almost none at your scale |
| Keyword search | Yes, easy: inverted index + BM25 (~100-200 lines) | None noticeable |
| Vector search | Yes, easy: brute-force cosine over a few thousand vectors takes milliseconds | None noticeable |
| Serial validation, multi-frame voting, versioning, manifest API | Yes | It is your own logic anyway |
| Currency classifier | Yes, with effort: small CNN trained from scratch, forward pass written in Dart or C | Lower accuracy than transfer learning; slower without GPU delegates |
| OCR | Yes, for serials only: segment characters, classify each with a tiny CNN (MNIST-style) | Works only for your fixed note formats |
| SLM | Technically yes, but weak: tiny transformer trained from scratch + a ~700-line C engine like `llama2.c` | Poor factual quality and far fewer tokens/sec than LiteRT on GPU |
| Camera and image decoding | Only via OS APIs (own Kotlin/Swift platform channels around CameraX / AVFoundation) | A fair amount of native code |
| GPU/NPU acceleration | Not realistically | This is where most of the speed comes from |

**Why not everything:** runtime and accelerator choice alone made roughly a 10x difference on the same model (about 52 tok/s on GPU vs about 5 on CPU). A from-scratch engine lands on the slow side.

**Suggested order:**
1. Build retrieval by hand and use templated answers with no language model (0 ms generation).
2. Build the serial-number character recognizer by hand.
3. Train your own classifier (run it through a runtime library first).
4. Only then try a from-scratch tiny language model or your own C engine as a learning project, and benchmark it against Gemma 3 270M. If it is not competitive on your phones, keep the library.

---

## 12. Backend Stack (no Firebase, no Supabase)

*From the research plus general knowledge; confirm current versions before committing.*

**Definition:** NotebookLM-style = **source-grounded Q&A**. Add sources, retrieve relevant passages, answer only from them, with citations. The backend has five jobs: ingest, store, retrieve, generate, serve.

| Layer | Fastest sensible choice | Why | Runner-up |
|---|---|---|---|
| API | NestJS on the **Fastify adapter**, SSE for streaming | You know it; the API is rarely the bottleneck | Go/Rust only if you need extreme concurrency |
| Database | **PostgreSQL + pgvector** (HNSW) + built-in full-text search | One DB for rows, vectors and keyword search | Qdrant past millions of vectors |
| Cache and queue | **Redis** (or Valkey) + **BullMQ** | Sub-millisecond lookups; easy jobs from Node | Valkey |
| LLM serving | **llama.cpp `llama-server`** (see section 13) | Small model, simple, fast | vLLM when many concurrent users |
| Embeddings | **Hugging Face Text Embeddings Inference (TEI)** serving EmbeddingGemma or a BGE model | Purpose-built fast embedding server | Same model inside the Python worker |
| Reranker | Small cross-encoder (e.g. a BGE reranker) via TEI | Better citations from fewer chunks | Skip at first |
| Ingestion | **Python worker** (pypdf or Docling, chunker, embed, store) | Best document-parsing tools | Node worker if sources are plain text |
| File storage | **MinIO** (self-hosted S3) or Cloudflare R2 | S3-compatible, easy CDN | Local disk to start |
| Auth | Own NestJS JWT module, or Keycloak / Better Auth | Self-hosted | none |
| Proxy / CDN | Caddy or Nginx, Cloudflare in front for model and data packs | HTTP/2, TLS, edge caching | none |
| Observability | OpenTelemetry + Prometheus + Grafana, Langfuse for LLM traces | See where milliseconds go | none |
| Hosting | Docker Compose first; later one GPU box if needed | Simple, then scale | Kubernetes only when you must |

**Request path:**
```
App -> Caddy -> NestJS/Fastify
  1. Redis cache check (exact key, optional semantic cache)
  2. Retrieval in Postgres in ONE round-trip:
       keyword search (full-text / BM25) + vector search (pgvector HNSW)
       merged with Reciprocal Rank Fusion (RRF)
  3. (optional) rerank top ~20 down to ~5
  4. Build prompt: numbered sources [1]..[5] + question
  5. llama-server streams tokens -> NestJS -> SSE -> app
  6. Parse [n] markers -> return source citations
```

**What gives speed (biggest first):**
1. Prefix/prompt caching (identical system prompt at the start of every request)
2. Quantized model (Q4_K_M GGUF)
3. Short prompts: 3-5 chunks, not 20
4. Stream everything
5. Co-locate API, Postgres, Redis and the model server
6. Cache answers in Redis by `(source set, normalized question, data version)`
7. HNSW index + connection pooling (PgBouncer or the Prisma pool)
8. Precompute summaries and "about this note" answers during ingestion

**MySQL note:** Postgres + pgvector is the most mature self-hosted vector option and combines with full-text search in one query. Prisma has no native vector type: define it with `Unsupported("vector(256)")` and run similarity queries as raw SQL. If you stay on MySQL, check its current vector support first (not verified here).

**Build order:**
1. Postgres + pgvector, ingestion script, retrieval, plain answer endpoint
2. Add `llama-server` and SSE streaming
3. Add Redis caching and the BullMQ ingestion queue
4. Add hybrid search with RRF, then a reranker if citations are weak
5. Add observability and tune with real latency numbers

---

## 13. Server-Side SLM Serving (small model only)

*From general knowledge; benchmark on your own hardware.*

For a small model, skip vLLM at first and use **llama.cpp's `llama-server`**. vLLM is built for serving a big model to many users on a GPU; a small model is cheap, so the simpler server is faster to set up with similar speed at low traffic.

| Your server | Best choice | Why |
|---|---|---|
| CPU only (cheap VPS) | llama.cpp `llama-server` | Best CPU speed for quantized GGUF; tiny footprint |
| One small GPU (8-24 GB) | llama.cpp first; vLLM if many simultaneous users | llama.cpp is simpler; vLLM wins when requests overlap heavily |
| Apple Silicon box | llama.cpp (Metal) or MLX | Both use unified memory well |
| Local development | Ollama | Easy, but adds overhead; not for production |

**Models and quantization:**
- Gemma 3 270M or 1B, Qwen small variants, or Gemma 4 E2B (check each licence)
- Format: GGUF
- `Q4_K_M` is the usual speed/quality balance; `Q8_0` for models under ~1B when memory is not tight; avoid Q2/Q3 for factual answers
- Use the same model family as on the phone so answers stay consistent

**Speed rules:**
1. Keep the model loaded in one long-running process; never reload per request
2. Keep the system prompt identical at the start of every request (prefix cache)
3. Send 3-5 retrieved facts, not 20
4. Stream tokens over SSE (`/v1/chat/completions` with `"stream": true`)
5. On CPU, set threads to physical cores, not hyperthreads
6. Set `--parallel` to your expected concurrency, not higher (each slot splits the context)
7. Cap context at 2K-4K tokens
8. With a GPU, offload all layers
9. Cache answers in Redis so repeated questions never reach the model

**Wiring:**
```
NestJS (Fastify) --HTTP/SSE--> llama-server (localhost, model always loaded)
     |
     +-- retrieval (Postgres + pgvector) builds the prompt first
```
Bind `llama-server` to `localhost`, let NestJS handle auth, rate limits and caching, and run it under Docker Compose or systemd with a restart policy.

**Switch to vLLM only if** you see many concurrent users and measurements show requests queuing behind each other.

---

## 14. Is It Free?

**The software is free; the machine to run it on is not.** (General knowledge: check each licence before you ship.)

| Piece | Licence (as far as I know) | Cost |
|---|---|---|
| llama.cpp / `llama-server` | MIT | Free, commercial use OK |
| PostgreSQL + pgvector | PostgreSQL licence | Free |
| Redis / Valkey | Valkey is BSD; Redis's licence has changed over time, so prefer Valkey if unsure | Free |
| NestJS, Fastify, BullMQ | MIT | Free |
| Caddy / Nginx, MinIO | Open source (MinIO is AGPL: matters if you modify it or offer it as a service) | Free |
| Flutter, LiteRT, ML Kit | Open source / free SDKs | Free |

**Free but read the licence:**
- Gemma 4: Apache 2.0 (per the research), free for commercial use
- Gemma 3 and EmbeddingGemma: Gemma Terms of Use, which carry use restrictions
- Qwen and others: each model card has its own licence
- Ultralytics YOLO: AGPL-3.0, so a closed-source app needs a paid licence

**What actually costs money:**
1. A server to run it (small CPU VPS is cheap; GPU box costs more; your own PC costs nothing extra)
2. Storage and bandwidth for model and data downloads (Cloudflare R2 has no egress fees, but check its current free tier)
3. Store fees: Google Play one-time registration, Apple annual developer fee
4. Domain (TLS via Caddy / Let's Encrypt is free)

**Zero-cost start:** run Postgres, Redis and `llama-server` on your own computer with Docker Compose, test the app on your own phones with on-device models, and rent a server only when you have real users.

---

## 15. Key Sources

- Ovadia et al., EMNLP 2024 (RAG beats fine-tuning for new facts): https://aclanthology.org/2024.emnlp-main.15/
- LiteRT-LM overview: https://ai.google.dev/edge/litert-lm/overview
- LiteRT-LM Flutter: https://ai.google.dev/edge/litert-lm/flutter
- LiteRT-LM speed blog: https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/
- Gemma 4 E2B model card: https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
- ML Kit text recognition (Android): https://developers.google.com/ml-kit/vision/text-recognition/v2/android
- `flutter_litert`: https://pub.dev/packages/flutter_litert
- `google_mlkit_text_recognition`: https://pub.dev/packages/google_mlkit_text_recognition
- `flutter_gemma_rag_sqlite`: https://pub.dev/packages/flutter_gemma_rag_sqlite
- Google Play for On-device AI: https://developer.android.com/google/play/on-device-ai
- Ultralytics licence: https://www.ultralytics.com/license

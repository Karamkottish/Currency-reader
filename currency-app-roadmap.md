# Currency App Roadmap — Detailed Steps and How-To
*Flutter app with on-device OCR + small language model (SLM) + your own currency data, backed by a self-hosted server.*
*Written 5 Nov 2026. Companion to `flutter-currency-app-guide.md`.*

**How to read this file.** Each stage has: **Goal**, **How to do it** (numbered steps), **Deliverable**, and an **Exit check** (do not move on until it passes). Time estimates assume one developer working part-time; treat them as rough.

**Honesty note.** Package names, versions, licences and speeds come from research done earlier in this chat plus general knowledge. Verify each on pub.dev / the project's page before you depend on it. Code snippets are skeletons to adapt, not tested drop-ins.

---

## Overview

| Stage | Name | Time | Result |
|---|---|---|---|
| 0 | Preparation | 2-3 days | Tools installed, devices ready, repo created |
| 1 | App shell, camera, OCR | 1 week | Camera → text on screen |
| 2 | Data and retrieval, no model | 1 week | Scan → facts from your database (templated answers) |
| 3 | On-device SLM spike | 1 week | Streamed answers + measured speeds |
| 4 | Currency classifier | 2-3 weeks | Reliable "which note is this" |
| 5 | Serial-number accuracy | 1 week | Validated serials with multi-frame voting |
| 6 | RAG on device | 1-2 weeks | Free-text questions answered from your facts |
| 7 | Backend | 2 weeks | Postgres + NestJS + `llama-server` running |
| 8 | Data packs and updates | 1-2 weeks | Add a currency without an app release |
| 9 | Tiers, hardening, performance | 2 weeks | Works well on weak and strong phones |
| 10 | Custom OCR and embedding-based ID | 3-4 weeks | Your own trained recognizer, no retraining per currency |
| 11 | Release and scale | ongoing | Store release, monitoring, growth |

**Guiding principle:** *vision decides, database knows, SLM speaks.* The model never "knows" currencies; it only rephrases facts you retrieve.

---

## Stage 0 — Preparation (2-3 days)

**Goal:** a working environment and real test devices.

**How to do it**
1. Install Flutter (stable), Android Studio, and Xcode if you target iOS. Run `flutter doctor` until it is clean.
2. Get at least **two real phones**: one flagship, one mid or low-end. Emulators give misleading speed numbers.
3. Install Python 3.11+ and create a virtualenv: `python -m venv .venv`.
4. Install Docker (for Postgres, Redis, `llama-server` later) and Node 20+.
5. Create one Git repo with folders: `app/` (Flutter), `server/` (NestJS), `ml/` (Python training), `data/` (currency sources), `docs/`.
6. Create a Hugging Face account for model downloads.
7. Write a **device log sheet** (spreadsheet): device model, RAM, chip, Android/iOS version. You will record every benchmark here.

**Deliverable:** repo skeleton + device log sheet.
**Exit check:** `flutter run` shows the default counter app on both phones.

---

## Stage 1 — App Shell, Camera and OCR (1 week)

**Goal:** point the camera at text and see it on screen in real time.

**How to do it**
1. Create the app: `flutter create app && cd app`.
2. Add packages:
   ```bash
   flutter pub add camera google_mlkit_text_recognition path_provider
   ```
3. Request camera permission (Android manifest + iOS `Info.plist` usage description).
4. Show a live preview using the `camera` plugin at about 720p.
5. Add a **guide rectangle** overlay. The user lines the note up inside it; later you will crop to this region.
6. Process frames with **latest-only backpressure**: keep a flag `busy`; if `busy`, drop the incoming frame. Only run OCR on every 2nd or 3rd frame.
7. Convert the camera image to an ML Kit `InputImage` (format depends on platform: NV21 on Android, BGRA on iOS).
8. Run `TextRecognizer(script: TextRecognitionScript.latin)` and display the recognized text under the preview.
9. Measure and log: milliseconds per OCR call, on both phones.

**Skeleton (adapt):**
```dart
bool busy = false;
int frameCount = 0;

Future<void> onFrame(CameraImage img) async {
  if (busy || (++frameCount % 3 != 0)) return;
  busy = true;
  try {
    final input = toInputImage(img); // platform-specific conversion
    final result = await recognizer.processImage(input);
    setState(() => text = result.text);
  } finally {
    busy = false;
  }
}
```

**Deliverable:** live camera + OCR text on screen.
**Exit check:** a printed serial number is read correctly most of the time in good light, and the UI stays smooth.

---

## Stage 2 — Data and Retrieval, No Model Yet (1 week)

**Goal:** scanning (or picking) a currency returns facts from *your* database. This is the fastest possible answer path (0 ms generation) and the foundation for everything else.

**How to do it**
1. **Define your schema.** Start with this and extend later:
   ```sql
   CREATE TABLE currencies(
     id INTEGER PRIMARY KEY, iso_code TEXT, country TEXT, name TEXT,
     symbol TEXT, issuer TEXT, active INTEGER, updated_at TEXT);
   CREATE TABLE denominations(
     id INTEGER PRIMARY KEY, currency_id INTEGER, kind TEXT, value REAL,
     series TEXT, introduced TEXT, material TEXT, size_mm TEXT, image_ref TEXT);
   CREATE TABLE facts(
     id INTEGER PRIMARY KEY, denomination_id INTEGER, currency_id INTEGER,
     lang TEXT, title TEXT, body TEXT, source TEXT, version INTEGER);
   CREATE VIRTUAL TABLE facts_fts USING fts5(title, body, content='facts', content_rowid='id');
   ```
2. **Collect your data by hand** for 3-5 currencies. Record a **source** for every fact (central bank page, official documents). Facts without sources cannot be trusted later.
3. Write each fact as a short, self-contained sentence (1-2 lines). Short chunks retrieve better and keep prompts small.
4. Build the SQLite file with a Python script that reads a CSV or JSON and fills the tables; commit the script, not just the output.
5. Ship the file as `assets/seed.sqlite`, copy it to app storage on first run, open with `sqlite3`.
6. **Layer 1 retrieval, exact lookup:** `SELECT * FROM facts WHERE denomination_id = ?`.
7. **Layer 2 retrieval, keyword search:** use FTS5 (`SELECT ... FROM facts_fts WHERE facts_fts MATCH ? ORDER BY rank LIMIT 5`).
8. **Templated answers:** write 6-10 question types ("material", "introduced", "security features", "size", "portrait") each mapped to a field and a sentence template. Example: `"The ${name} note is made of ${material}."`
9. Build a simple screen: a list of currencies, a detail page, and a search box.
10. Add a **"scan result" stub**: pick a currency manually for now; the classifier replaces this in Stage 4.

**If you want zero outside libraries here:** replace FTS5 with your own inverted index and BM25 scoring:
`score(d,q) = Σ IDF(t) · (f(t,d)·(k1+1)) / (f(t,d) + k1·(1 − b + b·|d|/avgdl))`, with typical `k1 = 1.2`, `b = 0.75`. It is about 100-200 lines and fast at your data size.

**Deliverable:** app answers common questions about your seed currencies using templates and search.
**Exit check:** 20 test questions, each answered correctly or with a clear "no information" message.

---

## Stage 3 — On-Device SLM Spike (1 week)

**Goal:** prove a small model runs on your phones, and record real speeds.

**How to do it**
1. Add the plugin: `flutter pub add flutter_gemma` (check pub.dev: it may be split into modular packages such as `flutter_gemma_litertlm`).
2. Download a model file from the Hugging Face `litert-community` organization:
   - **Gemma 4 E2B** `.litertlm` (about 2.6 GB) for strong phones, **or**
   - a **Gemma 3 270M** build for weak phones or a fast first test.
3. During development, push the file to the phone or download it at first launch (see Stage 8 for the production download flow). **Do not bundle it inside the app.**
4. Load the model once, create a chat session, and **stream tokens** into a `Text` widget through a `Stream<String>`.
5. Use a grounded prompt:
   ```
   System: You are a currency facts assistant. Answer ONLY from FACTS.
   If the answer is not in FACTS, say "I don't have that information yet."
   FACTS:
   [1] <fact text>
   [2] <fact text>
   User: <question>
   ```
6. Feed it facts from Stage 2's retrieval.
7. **Measure on each phone** and write to the device log: time-to-first-token (TTFT), tokens/second, peak RAM, and whether the GPU backend is actually active.
8. Compare GPU vs CPU backends if the plugin lets you choose.
9. Test a refusal: ask something not in FACTS. The model should say it does not know. If it invents an answer, tighten the prompt and lower the temperature.

**Reference numbers (Google's flagship figures, from the earlier research):** Gemma 4 E2B on GPU is about 52-56 tokens/s with about 0.3 s TTFT on an S26 Ultra / iPhone 17 Pro. Mid-range CPU-only runs are far slower (a few tokens/s, community reports). Your own numbers will differ; trust your log.

**Deliverable:** a chat screen answering from retrieved facts, plus a completed device log.
**Exit check:** on your best phone, question → first token in about 1 s or less; on your weakest, you know which tier it falls in.

---

## Stage 4 — Currency Classifier (2-3 weeks)

**Goal:** the camera identifies *which note or coin* it is, replacing the manual pick.

**How to do it**
1. **Define classes per side:** `EUR_20_front`, `EUR_20_back`, and so on. Add a `background` class (no note in frame) so the app can say "nothing detected."
2. **Collect images.** Aim for 200-500+ per class: different lighting, angles, backgrounds, folded and worn notes, partial occlusion, motion blur. Photograph with the same phones your users will have. Keep a held-out **test set** (e.g. 15%) that is never used for training.
3. **Check legal rules** on photographing and storing banknote images in your country before you collect or publish.
4. **Train with transfer learning** (Python). Skeleton in Keras style:
   ```python
   import tensorflow as tf
   base = tf.keras.applications.MobileNetV3Small(
       input_shape=(224,224,3), include_top=False, weights="imagenet")
   base.trainable = False
   model = tf.keras.Sequential([
       base, tf.keras.layers.GlobalAveragePooling2D(),
       tf.keras.layers.Dropout(0.2),
       tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")])
   model.compile("adam", "sparse_categorical_crossentropy", ["accuracy"])
   # augmentations: random rotation, brightness, contrast, zoom, blur
   ```
5. Train the head first, then **unfreeze the top layers** and fine-tune with a low learning rate.
6. **Evaluate on the held-out test set:** accuracy, per-class precision/recall, and a confusion matrix. Look at which notes get confused; add images for those.
7. **Export to LiteRT (`.tflite`) with full INT8 quantization** using a **representative dataset** of about 200 training images for calibration. Re-evaluate the quantized model; accuracy should drop only slightly.
8. Load it in Flutter with `flutter_litert` inside a **background isolate**. Preprocess natively where possible: resize to 224×224, normalize exactly as in training (a mismatch here is the most common cause of "works in Python, fails on phone").
9. Try the GPU delegate (Android) and Core ML / Metal (iOS). Log milliseconds per inference.
10. Use a **confidence threshold** and **multi-frame agreement** (e.g. same class in 3 of the last 5 frames) before announcing a result.

**Published reference points (from research):** MobileNetV2 on Indonesian rupiah reached about 96% validation accuracy on 4,340 images and 14 classes; a CNN on 50,334 Bangladeshi banknote images reached about 98.5%. Your results will depend on your own data.

**Deliverable:** `classifier_v1.tflite` + evaluation report + in-app live identification.
**Exit check:** on your held-out test photos, accuracy meets your target (e.g. 95%+), and on a live camera the wrong-ID rate is acceptable.

---

## Stage 5 — Serial-Number Accuracy (1 week)

**Goal:** serials are read correctly or rejected, never silently wrong.

**How to do it**
1. Use the classifier result to know **where the serial is** for that note. Store per-denomination ROI rectangles (relative coordinates) in your database.
2. **Crop to the ROI** before OCR; this makes it much faster and more accurate than full-frame OCR.
3. Preprocess the crop: grayscale, contrast stretch, optional sharpening. Test whether each helps; keep only what improves results.
4. Write a **regex per currency** (e.g. `^[A-Z]{2}\d{8}$`) and, if the issuer publishes one, **check-digit logic**.
5. **Normalize common confusions** before validating (O↔0, I↔1, S↔5, B↔8) only in positions where the format expects digits or letters.
6. **Temporal voting:** keep the last N valid readings; accept a serial only when it appears in K of N frames (e.g. 3 of 5).
7. Stop the camera loop when a result is confirmed. This saves battery and heat.
8. Log every failed read (the crop image plus OCR text), with user consent. These become training data in Stage 10.

**Deliverable:** serial reader with validation and voting.
**Exit check:** on 50 real notes, no wrong serial is accepted; unreadable ones are rejected with a "re-aim" message.

---

## Stage 6 — RAG on Device (1-2 weeks)

**Goal:** free-text and paraphrased questions are answered correctly from your facts.

**How to do it**
1. **Understand why RAG, not fine-tuning.** Research (Ovadia et al., EMNLP 2024) found RAG consistently beat unsupervised fine-tuning for injecting facts, and that models struggle to learn new facts through fine-tuning. RAG also updates in minutes.
2. Add the embedding model **EmbeddingGemma** (via the `flutter_gemma` embeddings package or your own runtime). Use **256-dimension** vectors (it supports Matryoshka truncation).
3. On the server or in a Python script, **embed every fact** with the *same model and version* the app uses. Store vectors in a `vec0` virtual table via **sqlite-vec** (`flutter_gemma_rag_sqlite` or `sqlite3_vec`).
4. On the phone, only the **user's question** is embedded (one short inference).
5. **Three-layer retrieval, fastest first:**
   1. exact lookup by `currency_id` (after a scan)
   2. FTS5 keyword search
   3. vector KNN for paraphrases
6. **Merge results** with Reciprocal Rank Fusion: `score(d) = Σ 1 / (k + rank_i(d))`, `k ≈ 60`.
7. Take the **top 3-5 facts** (300-800 tokens), build the prompt from Stage 3, and stream the answer.
8. **Cache** answers by `(currency_id, normalized_question, pack_version)`.
9. **Build an evaluation set:** 50-100 questions with expected facts. After every change, measure *retrieval hit rate* (was the right fact in the top 5?) and *answer correctness*. Without this you cannot tell whether a change helped.

**Deliverable:** question box that retrieves and answers with grounded text.
**Exit check:** retrieval hit rate on your evaluation set meets your target (e.g. 90%+ in the top 5), and refusals work for out-of-scope questions.

---

## Stage 7 — Backend (2 weeks)

**Goal:** a self-hosted server that stores data, retrieves, generates, and serves. No Firebase, no Supabase.

**How to do it**
1. **Docker Compose** for local development:
   ```yaml
   services:
     db:
       image: pgvector/pgvector:pg16
       environment: { POSTGRES_PASSWORD: change_me, POSTGRES_DB: currency }
       ports: ["5432:5432"]
       volumes: [pgdata:/var/lib/postgresql/data]
     cache:
       image: valkey/valkey:latest
       ports: ["6379:6379"]
   volumes: { pgdata: {} }
   ```
2. **Database:** `CREATE EXTENSION vector;` then tables for currencies, denominations, facts (with `embedding vector(256)`), plus an HNSW index:
   ```sql
   CREATE INDEX ON facts USING hnsw (embedding vector_cosine_ops);
   ```
   Add a `tsvector` column with a GIN index for full-text search. With Prisma, declare the vector column as `Unsupported("vector(256)")` and run similarity queries as raw SQL.
3. **API:** NestJS with the **Fastify adapter**. Endpoints to start:
   - `POST /v1/ask` (retrieve → prompt → stream answer over SSE)
   - `GET /v1/manifest` (latest pack and model versions)
   - `POST /v1/feedback`
4. **Model server:** run llama.cpp's `llama-server` on the same machine, bound to localhost:
   ```bash
   llama-server -m gemma-small-Q4_K_M.gguf --host 127.0.0.1 --port 8080 \
     -c 4096 --parallel 2 -t <physical_cores>
   # with a GPU, add -ngl 99 to offload all layers
   ```
   (Flag names change between releases: check `llama-server --help`.)
5. **Streaming:** call `llama-server`'s OpenAI-compatible `/v1/chat/completions` with `"stream": true` and forward chunks to the app via SSE.
6. **One-query hybrid retrieval:** keyword (full-text) + vector (HNSW) merged with RRF, in a single round-trip. Optionally rerank the top 20 down to 5 later.
7. **Redis/Valkey:** cache answers; use BullMQ for ingestion jobs.
8. **Ingestion worker (Python):** parse sources (PDF or text) → chunk into short facts → embed (same model as the app) → insert with `source` and `version`.
9. **Auth and limits:** JWT module in NestJS plus rate limiting. Never expose `llama-server` or Postgres publicly.
10. **Observability:** log latency per step (cache, retrieval, TTFT, total). Add Prometheus/Grafana later.

**Deliverable:** `docker compose up` gives a working `/v1/ask` that streams grounded answers with citations.
**Exit check:** server round-trip to first token is acceptable on your machine, and you can see the time split per step.

---

## Stage 8 — Data Packs and Updates Without a Release (1-2 weeks)

**Goal:** add a new currency in minutes, with no app-store release and no model retraining.

**How to do it**
1. **Admin panel** (Next.js) to enter currencies, denominations, facts (with sources), and upload reference photos.
2. A **Python build job** (triggered through BullMQ) that:
   1. embeds new facts
   2. rebuilds the SQLite pack (tables + FTS5 + vec0)
   3. computes SHA-256
   4. uploads to object storage (MinIO or R2) behind a CDN
3. **Manifest table** (Prisma example fields): `kind, platform, tier, version, url, sha256, size, min_app_version, rollout_pct`. Embed-model name and dimension go in the pack's `pack_meta` so the app can refuse an incompatible pack.
4. **App update flow:**
   1. on launch (and every ~24 h) fetch `/v1/manifest`
   2. if a newer compatible pack exists, download it in the background (resumable)
   3. verify SHA-256
   4. write to a temp file, then **rename atomically** over the old pack
   5. keep the previous pack until a smoke test passes
5. **Model download UI** for the SLM: optional, Wi-Fi preferred, with progress, resume, and SHA-256 verification. Android needs a foreground service for large downloads. The app must stay useful (templates or small model) while the big model downloads.
6. **Store-policy reminders:** model weights are data and may be downloaded, but **native runtimes (`.so`) must ship inside the app binary**, never be downloaded.
7. **Do not use Firebase ML** for model hosting: per the research, Firebase announced it is deprecated with shutdown on 15 June 2027. Use your own CDN.
8. **Versioning:** name artifacts by content and version (`datapack@2026.11.05-1`), set long cache lifetimes, and support rollback.

**Deliverable:** end-to-end "add currency → live in app" flow.
**Exit check:** you add a new currency in the admin panel and see correct answers in the app within minutes, with no app release.

---

## Stage 9 — Device Tiers, Hardening and Performance (2 weeks)

**Goal:** works well on both weak and strong phones, and stays fast.

**How to do it**
1. **Define tiers**
   | Tier | Device | Behaviour |
   |---|---|---|
   | A | 6 GB+ RAM, working GPU/NPU | Gemma 4 E2B |
   | B | about 4 GB RAM or no usable GPU | Gemma 3 270M (INT4) |
   | C | very old | Templated answers + keyword search, no model |
2. **Detect the real backend at runtime.** Some Android GPUs (notably Mali) can silently fall back to CPU. Run a short benchmark prompt at first launch; if tokens/s is below a threshold, demote the device one tier.
3. **Use long-lived worker isolates** for vision and for knowledge work; pass image bytes with `TransferableTypedData`.
4. **Warm up at startup:** load models during the splash screen and run one dummy inference. Enable GPU kernel caching so later launches are fast.
5. **Memory:** unload the SLM when the app is backgrounded on low-RAM phones; reload on demand.
6. **Keep prompts short** (3-5 facts) and cap context at 2K-4K tokens.
7. **Cache** common answers; precompute "about this note" summaries in the pack so most questions skip the model.
8. **Battery and heat:** stop the camera loop after confirmation; prefer GPU/NPU over CPU.
9. **Failure handling:** model missing, download failed, pack corrupted, out of memory. Each needs a clear message and a fallback (a lower tier).
10. **Test on real low-end hardware.** Track camera-to-ID latency, OCR accuracy, TTFT and tokens/s per device model in your feedback analytics.

**Deliverable:** tier logic + performance dashboard from the device log.
**Exit check:** the weakest supported phone gives a usable (if simpler) experience; the strongest hits your speed targets.

---

## Stage 10 — Custom OCR and Embedding-Based ID (3-4 weeks)

**Goal:** your own trained serial recognizer, and new currencies that need only reference photos.

**How to do it — custom serial recognizer**
1. Use the failed-read crops from Stage 5 plus **synthetic serials**: render strings in fonts similar to the notes, with blur, perspective, glare, and colour noise.
2. Choose one of two paths:
   - **Easier, by hand:** segment characters and classify each with a tiny CNN (MNIST-style). Works for fixed formats only.
   - **Stronger:** fine-tune only the **PP-OCRv5 mobile recognizer** (not the detector) on your crops using PaddleOCR's training pipeline (Apache 2.0). Export to ONNX or LiteRT and quantize to INT8 with a calibration set.
3. Compare against ML Kit on the **same held-out crops**; adopt yours only if it wins.
4. Ship it as a downloadable model through Stage 8's manifest.

**How to do it — embedding-based currency ID**
1. Take your trained classifier backbone (penultimate layer) as an **image embedding** model.
2. For each note side, store reference embeddings in the data pack (`visual_refs`).
3. At runtime, embed the camera frame and find the **nearest neighbour** by cosine distance; accept only above a similarity threshold.
4. A new currency now needs only 5-20 reference photos uploaded in the admin panel, not retraining.
5. Re-evaluate on your held-out set. If accuracy drops, fine-tune the backbone with a metric-learning loss (e.g. triplet or contrastive) and re-export.

**Optional:** a one-time LoRA style-tune of Gemma 3 270M so the small model follows your answer format. Facts still come from RAG; this does **not** need repeating when you add currencies.

**Deliverable:** `ocr_rec_v1` and `visual_embed_v1`, each beating the earlier baseline on your held-out set.
**Exit check:** you can add a currency with photos and facts only, and it is recognized correctly in the app.

---

## Stage 11 — Release and Scale (ongoing)

**Goal:** a safe launch, then steady improvement.

**How to do it**
1. **Pre-release checklist:** licences confirmed; privacy policy (scans stay on-device by default); no "counterfeit detector" marketing claims; banknote image rules checked for each target country; permissions text clear.
2. **Licence check list:**
   - Gemma 4: Apache 2.0 (per research); Gemma 3 and EmbeddingGemma: Gemma Terms of Use; confirm each model card
   - Ultralytics YOLO is AGPL-3.0: avoid it or buy a licence for a closed-source app
   - MinIO is AGPL: understand the implications if you modify it or offer it as a service
3. **Staged rollout:** use `rollout_pct` in the manifest and bucket users by a hash of an install ID. Start at 5%, watch crash and latency numbers, then increase.
4. **Monitor:** per-device TTFT, tokens/s, OCR failure rate, unanswered questions, pack download failures.
5. **Weekly loop:** review unanswered questions and failed reads → add facts and photos → rebuild the pack → ship.
6. **Scale the server only when numbers say so:** move from `llama-server` to vLLM if many concurrent users make requests queue; move to Qdrant only past millions of vectors; add Kubernetes only when you must.
7. **Optional later:** NPU-specific model builds via Google Play's on-device AI delivery and Apple-hosted Background Assets; OS built-in models (Gemini Nano, Apple Foundation Models) as an extra tier; a server fallback for weak phones.

**Deliverable:** live app with monitoring and a repeatable update loop.
**Exit check:** you can ship a data update safely in under an hour and roll it back if needed.

---

## Cost Summary (software free, hardware not)

- **Free to use** (as far as I know; check each licence): llama.cpp (MIT), PostgreSQL and pgvector, Valkey, NestJS/Fastify/BullMQ, Caddy/Nginx, Flutter, LiteRT, ML Kit.
- **Costs money:** a server (a small CPU VPS is cheap; a GPU box costs more; your own computer costs nothing extra), storage and bandwidth for model and data downloads, store fees (Google Play one-time registration, Apple annual fee), and a domain.
- **Zero-cost start:** run Postgres, Valkey and `llama-server` on your own computer with Docker Compose, test with on-device models on your own phones, and rent a server only when you have real users.

---

## Master Checklist

- [ ] **0** Environment, devices, repo, device log
- [ ] **1** Camera + ML Kit OCR with frame dropping
- [ ] **2** Schema, seed data, FTS5/BM25, templated answers
- [ ] **3** On-device SLM, streamed grounded answers, benchmark log
- [ ] **4** Dataset, trained INT8 classifier, live identification
- [ ] **5** ROI crop, regex/check-digit validation, multi-frame voting
- [ ] **6** Embeddings, sqlite-vec, RRF, evaluation set
- [ ] **7** Postgres + pgvector, NestJS, `llama-server`, SSE, caching
- [ ] **8** Admin panel, pack builder, manifest, atomic updates, download UI
- [ ] **9** Tiers, runtime backend detection, warm-up, memory handling
- [ ] **10** Custom serial recognizer, embedding-based ID, optional style-tune
- [ ] **11** Licence and legal check, staged rollout, monitoring, weekly loop

---

## Main Risks to Watch

1. **Wrong ID or serial presented as certain.** Always show confidence and reject low-confidence results.
2. **Model hallucination.** Ground every answer in retrieved facts and force "I don't have that information yet."
3. **Silent GPU fallback to CPU** on some Android phones. Detect with a runtime benchmark.
4. **Large downloads** (the big model is about 2.6 GB). Keep it optional and Wi-Fi preferred.
5. **Embedding mismatch.** The pack's embeddings and the app's query embeddings must come from the same model and version.
6. **Fast-moving packages.** Pin versions, and wrap the model engine behind your own interface so you can swap in llama.cpp if a plugin breaks.
7. **Legal rules about banknote images** vary by country; check before collecting or publishing.

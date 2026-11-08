# Flutter App — File Structure and State Management
*For the on-device currency app: camera + OCR + classifier + small language model + local database.*
*Written 5 Nov 2026. This is architecture guidance from general knowledge, not from the earlier package research. Verify package names and APIs on pub.dev before using them.*

---

## 1. Principles

1. **Feature-first structure.** Group code by feature (`scan`, `chat`, `knowledge`), not by type (`screens`, `models`). Everything a feature needs lives in one folder.
2. **Three layers inside each feature:** `presentation` (widgets + state), `domain` (pure Dart rules and entities), `data` (SQLite, ML engines, network).
3. **Dependencies point inward:** presentation → domain ← data. The domain layer imports nothing from Flutter or from plugins.
4. **Heavy work never runs on the UI isolate.** Vision, OCR, embedding and language-model inference run in worker isolates (or native threads) and report back through streams.
5. **One engine behind one interface.** `InferenceEngine`, `OcrEngine`, `Classifier`, `Retriever` are abstract classes. The plugin is an implementation detail so you can swap `flutter_gemma` for llama.cpp without touching features.
6. **State is explicit and immutable.** Every screen's state is a small immutable class (or sealed class); the UI is a pure function of it.

---

## 2. Recommended State Management: Riverpod

**Definition.** *State management* is how an app stores data that changes over time, lets widgets read it, and rebuilds only the widgets affected when it changes.

**Why Riverpod for this app** (general reasoning, not benchmarked):
- It works well with **streams and futures** (camera frames, token streaming, downloads).
- Providers are **global but testable** (override any provider in tests).
- **Dependency injection is built in:** engines, repositories and databases are providers.
- `AsyncValue` models loading / data / error without hand-written flags.
- Auto-dispose controls lifetime, which matters for models that use hundreds of MB of RAM.

**Alternatives:** **Bloc/Cubit** is also a good fit, with a stricter event-driven style and many teams prefer it for large codebases. **Provider** is simpler but less capable. Pick one and use it everywhere; mixing styles is the real mistake.

Packages: `flutter_riverpod` (and optionally `riverpod_annotation` + `riverpod_generator` + `build_runner` for code generation). Check pub.dev for the current major version, since Riverpod's API has changed between versions.

---

## 3. Folder Structure

```
app/
├── lib/
│   ├── main.dart                         # runApp(ProviderScope(...)), warm-up hooks
│   │
│   ├── app/
│   │   ├── app.dart                      # MaterialApp.router
│   │   ├── router.dart                   # go_router routes
│   │   ├── theme/                        # colors, typography, spacing
│   │   └── bootstrap.dart                # init DB, prefs, tier detection before UI
│   │
│   ├── core/
│   │   ├── config/                       # env, API base URL, feature flags
│   │   ├── errors/                       # Failure types, error mapping
│   │   ├── result/                       # Result<T, Failure> helper
│   │   ├── logging/                      # logger, performance timers
│   │   ├── platform/                     # device info, RAM, GPU/backend checks
│   │   ├── isolates/                     # generic long-lived worker isolate helper
│   │   └── utils/                        # debouncer, throttler, extensions
│   │
│   ├── features/
│   │   ├── scan/                         # camera + frame pipeline
│   │   │   ├── presentation/
│   │   │   │   ├── scan_screen.dart
│   │   │   │   ├── scan_controller.dart  # Notifier
│   │   │   │   ├── scan_state.dart       # sealed state
│   │   │   │   └── widgets/              # guide overlay, result card
│   │   │   ├── domain/
│   │   │   │   ├── entities/             # ScanResult, Frame, SerialReading
│   │   │   │   ├── serial_validator.dart # regex, check digits, confusions
│   │   │   │   └── vote_aggregator.dart  # multi-frame agreement
│   │   │   └── data/
│   │   │       ├── camera_source.dart
│   │   │       ├── vision_worker.dart    # isolate: classifier + OCR
│   │   │       └── ocr/                  # ml_kit_ocr.dart, custom_ocr.dart
│   │   │
│   │   ├── identify/                     # currency ID models
│   │   │   ├── domain/classifier.dart    # abstract Classifier
│   │   │   └── data/
│   │   │       ├── litert_classifier.dart
│   │   │       └── embedding_matcher.dart
│   │   │
│   │   ├── knowledge/                    # database + retrieval
│   │   │   ├── presentation/             # currency list, detail
│   │   │   ├── domain/
│   │   │   │   ├── entities/             # Currency, Denomination, Fact
│   │   │   │   └── retriever.dart        # abstract Retriever
│   │   │   └── data/
│   │   │       ├── app_database.dart     # SQLite open, migrations
│   │   │       ├── fact_dao.dart
│   │   │       ├── fts_search.dart
│   │   │       ├── vector_search.dart
│   │   │       ├── hybrid_retriever.dart # exact + FTS + vector + RRF
│   │   │       └── template_answers.dart # no-model answers
│   │   │
│   │   ├── chat/                         # SLM question answering
│   │   │   ├── presentation/
│   │   │   │   ├── chat_screen.dart
│   │   │   │   ├── chat_controller.dart  # streams tokens into state
│   │   │   │   └── chat_state.dart
│   │   │   ├── domain/
│   │   │   │   ├── inference_engine.dart # abstract: load, generate, cancel
│   │   │   │   ├── prompt_builder.dart
│   │   │   │   └── answer_cache.dart
│   │   │   └── data/
│   │   │       ├── gemma_engine.dart     # flutter_gemma implementation
│   │   │       └── llama_engine.dart     # optional fallback implementation
│   │   │
│   │   ├── models_manager/               # model + data pack downloads
│   │   │   ├── presentation/             # download screen / banner
│   │   │   ├── domain/
│   │   │   │   ├── manifest.dart
│   │   │   │   └── artifact.dart         # kind, version, sha256, size
│   │   │   └── data/
│   │   │       ├── manifest_api.dart
│   │   │       ├── downloader.dart       # resumable + hash verify
│   │   │       └── pack_installer.dart   # temp file -> atomic rename
│   │   │
│   │   ├── tiering/                      # A/B/C device tier
│   │   │   ├── domain/device_tier.dart
│   │   │   └── data/benchmark_runner.dart
│   │   │
│   │   ├── feedback/                     # misreads, unanswered questions
│   │   └── settings/                     # language, data use, consent
│   │
│   └── shared/
│       ├── widgets/                      # buttons, loaders, error views
│       └── providers/                    # app-wide providers (db, prefs, http)
│
├── assets/
│   ├── seed.sqlite                       # starter data pack
│   └── models/                           # ONLY tiny models; big ones are downloaded
│
├── test/
│   ├── unit/                             # validators, voting, prompt builder
│   ├── provider/                         # controllers with overridden providers
│   └── golden/                           # widget snapshots
├── integration_test/                     # full flows on a device
└── pubspec.yaml
```

---

## 4. Categories of State in This App

Knowing *where* each kind of state belongs prevents most bugs.

| Kind | Examples | Where it lives | Tool |
|---|---|---|---|
| **UI-local state** | text field focus, expanded panel | the widget itself | `StatefulWidget` or a hook |
| **Screen state** | scan status, chat messages | a feature controller | `Notifier` / `AsyncNotifier` |
| **Streams** | camera frames, generated tokens, download progress | a data-layer source, exposed as a stream | `StreamProvider` or a stream inside a notifier |
| **Long-lived services** | model engines, database connection, isolates | providers with controlled lifetime | `Provider` / `keepAlive` |
| **Persistent state** | settings, installed pack version, answer cache | disk | SQLite / `shared_preferences` |
| **Global app state** | device tier, active pack version, consent | app-level providers | `Notifier` |

**Rule:** a widget reads state with `ref.watch` and triggers changes with `ref.read(provider.notifier).method()`. A widget never talks to a plugin directly.

---

## 5. Core Patterns With Examples

*These are skeletons that show the shape. Adjust to the Riverpod version you install.*

### 5.1 Scan state as a sealed class

A sealed class forces you to handle every case, so no screen can be in an impossible state.

```dart
sealed class ScanState { const ScanState(); }

class ScanIdle extends ScanState { const ScanIdle(); }

class ScanSearching extends ScanState {
  const ScanSearching({this.hint});
  final String? hint;               // e.g. "Move closer"
}

class ScanLocked extends ScanState {  // currency identified, reading serial
  const ScanLocked({required this.currencyId, required this.confidence});
  final String currencyId;
  final double confidence;
}

class ScanConfirmed extends ScanState {
  const ScanConfirmed({required this.currencyId, this.serial});
  final String currencyId;
  final String? serial;
}

class ScanFailed extends ScanState {
  const ScanFailed(this.failure);
  final Failure failure;
}
```

### 5.2 Scan controller (notifier)

```dart
class ScanController extends Notifier<ScanState> {
  late final VisionWorker _worker;
  final _votes = VoteAggregator(windowSize: 5, required: 3);
  StreamSubscription? _sub;

  @override
  ScanState build() {
    _worker = ref.watch(visionWorkerProvider);
    ref.onDispose(() { _sub?.cancel(); });
    return const ScanIdle();
  }

  void start() {
    state = const ScanSearching();
    _sub = _worker.results.listen(_onResult);   // results come from an isolate
  }

  void _onResult(VisionResult r) {
    if (r.confidence < 0.8) return;             // ignore weak frames
    final agreed = _votes.add(r.currencyId);
    if (agreed != null) {
      state = ScanConfirmed(currencyId: agreed, serial: r.validSerial);
      _sub?.cancel();                           // stop camera loop: saves battery
    } else {
      state = ScanLocked(currencyId: r.currencyId, confidence: r.confidence);
    }
  }
}

final scanControllerProvider =
    NotifierProvider<ScanController, ScanState>(ScanController.new);
```

### 5.3 Worker isolates behind a provider

```dart
// core/isolates: a long-lived isolate that owns the heavy models.
// Frames in -> results out. Models load once, inside the isolate.
final visionWorkerProvider = Provider<VisionWorker>((ref) {
  final worker = VisionWorker()..start();       // spawns isolate, loads models
  ref.onDispose(worker.dispose);
  return worker;
});
```

Pass image bytes with `TransferableTypedData` to avoid copying. Use **latest-frame-only backpressure**: if the worker is busy, drop incoming frames.

### 5.4 Chat state with token streaming

```dart
class ChatState {
  const ChatState({this.messages = const [], this.streaming = false, this.error});
  final List<ChatMessage> messages;
  final bool streaming;
  final Failure? error;
  ChatState copyWith({...}) => ...;
}

class ChatController extends Notifier<ChatState> {
  @override
  ChatState build() => const ChatState();

  Future<void> ask(String question, {String? currencyId}) async {
    final retriever = ref.read(retrieverProvider);
    final engine    = ref.read(inferenceEngineProvider);
    final cache     = ref.read(answerCacheProvider);

    final cached = await cache.get(question, currencyId);
    if (cached != null) { _append(question, cached); return; }

    state = state.copyWith(streaming: true);
    final facts  = await retriever.search(question, currencyId: currencyId);
    final prompt = PromptBuilder.build(question, facts.take(5));

    final buffer = StringBuffer();
    await for (final token in engine.generate(prompt)) {
      buffer.write(token);
      _updateLastMessage(buffer.toString());     // UI rebuilds per token (throttle if janky)
    }
    await cache.put(question, currencyId, buffer.toString());
    state = state.copyWith(streaming: false);
  }

  void cancel() => ref.read(inferenceEngineProvider).cancel();
}
```

Throttle UI updates (for example every 30-50 ms) if per-token rebuilds cause jank.

### 5.5 Engine lifetime (memory-sensitive)

```dart
final inferenceEngineProvider = Provider<InferenceEngine>((ref) {
  final tier = ref.watch(deviceTierProvider);
  final engine = switch (tier) {
    DeviceTier.a => GemmaEngine(model: ModelKind.e2b),
    DeviceTier.b => GemmaEngine(model: ModelKind.small270m),
    DeviceTier.c => TemplateOnlyEngine(),         // no model at all
  };
  ref.onDispose(engine.unload);
  return engine;
});
```

Unload the engine when the app goes to the background on low-RAM devices and reload on demand (a few seconds). Hook this to `AppLifecycleState`.

### 5.6 Download state machine

```dart
sealed class DownloadState { const DownloadState(); }
class NotInstalled  extends DownloadState { const NotInstalled(); }
class Queued        extends DownloadState { const Queued(); }
class Downloading   extends DownloadState { const Downloading(this.progress); final double progress; }
class Verifying     extends DownloadState { const Verifying(); }
class Installed     extends DownloadState { const Installed(this.version); final String version; }
class DownloadError extends DownloadState { const DownloadError(this.failure, {this.canResume = true}); final Failure failure; final bool canResume; }
```

Install flow: download to a temp file → verify SHA-256 → atomic rename → keep the old pack until a smoke test passes → update `installedPackVersionProvider`.

### 5.7 Tier detection

```dart
final deviceTierProvider = AsyncNotifierProvider<DeviceTierNotifier, DeviceTier>(...);
// 1. read RAM + chip info
// 2. run a short benchmark prompt on first launch
// 3. if tokens/sec is below a threshold, demote one tier
// 4. persist the result; allow a manual "re-test" in settings
```

---

## 6. Dependency Wiring (the provider graph)

```
databaseProvider ──> factDaoProvider ──> hybridRetrieverProvider ──> retrieverProvider
embedderProvider ─────────────────────────────┘ (vector layer)

deviceTierProvider ──> inferenceEngineProvider ──> chatControllerProvider
retrieverProvider  ──────────────────────────────┘
answerCacheProvider ─────────────────────────────┘

visionWorkerProvider ──> scanControllerProvider
manifestApiProvider ──> downloaderProvider ──> modelsManagerProvider
```

Controllers depend on **abstract** providers (`retrieverProvider`, `inferenceEngineProvider`). The implementation is chosen in one place, so tests override a single provider with a fake.

---

## 7. Navigation

Use `go_router` (or your preferred router) with named routes:
`/scan`, `/currency/:id`, `/chat`, `/models`, `/settings`.
Gate the chat screen on engine readiness: if the model is not installed, show the template-only experience with a prompt to download.

---

## 8. Error Handling

- Data layer returns `Result<T, Failure>` or throws typed exceptions that controllers map to `Failure`.
- `Failure` examples: `ModelMissing`, `ModelLoadFailed`, `OutOfMemory`, `DownloadFailed`, `PackIncompatible`, `CameraDenied`, `LowConfidence`.
- Every `Failure` has a **user-facing message** and a **fallback** (for example, `ModelLoadFailed` → drop to Tier B or templates).
- Never show a raw exception to the user.

---

## 9. Testing Strategy

| Level | What | How |
|---|---|---|
| Unit | serial validator, vote aggregator, prompt builder, RRF merge | plain Dart tests, no Flutter |
| Provider | controllers | `ProviderContainer` with fake engines/retrievers via `overrides` |
| Widget | scan overlay, chat list | `flutter_test` + golden images |
| Integration | scan → answer on a real device | `integration_test` |
| Performance | TTFT, tokens/sec, ms per frame | benchmark screen that writes to your device log |

Write the **fake engine** and **fake retriever** first; they make every controller testable without a phone or a model file.

---

## 10. Performance Rules for State

1. Use `ref.watch(provider.select((s) => s.field))` so widgets rebuild only for the field they use.
2. Keep frames and tensors **out of Riverpod state**. Hold only small results (class id, confidence, text).
3. Throttle token updates in the UI.
4. Dispose workers, streams and engines in `ref.onDispose`.
5. Use `keepAlive` only for what must survive screen changes (database, engine, worker); let everything else auto-dispose.
6. Warm up models in `bootstrap.dart` during the splash screen, not on first use.

---

## 11. Naming and Code Conventions

- Files: `snake_case.dart`. Classes: `UpperCamelCase`.
- Providers: `somethingProvider`. State classes: `SomethingState`. Controllers: `SomethingController`.
- One public class per file when it is a feature entry point.
- Run `dart format` and `flutter analyze` in CI; enable `very_good_analysis` or similar lints.

---

## 12. Build Order for This Structure

1. `core/` + `app/` skeleton, router, theme, `ProviderScope`
2. `knowledge/` (database + templates), because the rest depends on it
3. `scan/` with ML Kit only
4. `chat/` with the fake engine, then the real engine
5. `identify/` classifier inside the vision worker
6. `models_manager/` and `tiering/`
7. `feedback/` and `settings/`

---

## 13. Common Mistakes to Avoid

- Calling a plugin from a widget (breaks testing and swapping).
- Running inference on the UI isolate.
- Putting camera frames or big lists in state.
- Mixing two state-management styles.
- One giant "AppState" with everything inside.
- Forgetting to cancel generation when the user leaves the chat screen.
- Loading the model on every screen open instead of keeping one engine alive.

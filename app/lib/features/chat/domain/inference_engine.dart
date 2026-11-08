/// The only thing features know about language models. Implementations:
/// FakeInferenceEngine (now), GemmaEngine (Stage 3), LlamaEngine (optional).
abstract class InferenceEngine {
  Future<void> load();
  Stream<String> generate(String prompt);
  void cancel();
  Future<void> unload();
}

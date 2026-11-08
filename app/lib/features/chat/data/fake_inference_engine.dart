import '../domain/inference_engine.dart';

/// Streams a canned answer word by word. Lets chat be built and tested
/// without a model file or a phone.
class FakeInferenceEngine implements InferenceEngine {
  bool _cancelled = false;

  @override
  Future<void> load() async {}

  @override
  Stream<String> generate(String prompt) async* {
    _cancelled = false;
    for (final word in 'This is a placeholder answer.'.split(' ')) {
      if (_cancelled) return;
      await Future<void>.delayed(const Duration(milliseconds: 80));
      yield '$word ';
    }
  }

  @override
  void cancel() => _cancelled = true;

  @override
  Future<void> unload() async {}
}

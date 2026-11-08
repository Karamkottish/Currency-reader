/// Plugin-independent OCR interface. Stage 1: ML Kit implementation.
/// Stage 10: custom recognizer.
abstract class OcrEngine {
  Future<String> recognize(OcrInput input);
  Future<void> dispose();
}

/// Plain bytes + metadata so the domain never sees plugin types.
class OcrInput {
  const OcrInput({
    required this.bytes,
    required this.width,
    required this.height,
    required this.rotation,
    required this.format,
  });
  final List<int> bytes;
  final int width;
  final int height;
  final int rotation;
  final String format; // 'nv21' (Android) or 'bgra8888' (iOS)
}

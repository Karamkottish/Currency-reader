import 'dart:typed_data';

/// Plugin-independent OCR interface. Stage 1: ML Kit implementation.
/// Stage 10: custom recognizer.
abstract class OcrEngine {
  /// Returns the recognised text lines, top to bottom.
  Future<List<String>> recognize(OcrInput input);

  Future<void> dispose();
}

enum OcrPixelFormat {
  /// Android camera frames.
  nv21,

  /// iOS camera frames.
  bgra8888,
}

/// Plain bytes plus metadata, so nothing outside the data layer sees plugin
/// types.
class OcrInput {
  const OcrInput({
    required this.bytes,
    required this.width,
    required this.height,
    required this.bytesPerRow,
    required this.rotationDegrees,
    required this.format,
  });

  final Uint8List bytes;
  final int width;
  final int height;
  final int bytesPerRow;

  /// Clockwise rotation (0, 90, 180 or 270) that makes the frame upright.
  final int rotationDegrees;
  final OcrPixelFormat format;
}

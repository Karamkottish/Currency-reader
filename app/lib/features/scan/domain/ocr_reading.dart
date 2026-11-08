/// What OCR read from one camera frame.
class OcrReading {
  const OcrReading({required this.lines, required this.elapsed});

  /// Recognised text lines, top to bottom, empty ones removed.
  final List<String> lines;

  /// How long recognition took. Goes in the device log.
  final Duration elapsed;

  bool get isEmpty => lines.isEmpty;
}

import 'package:flutter/painting.dart' show Size;
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import 'ocr_engine.dart';

/// On-device text recognition with Google ML Kit (Latin script).
///
/// Latin covers English and most European banknotes. Arabic, Cyrillic and
/// other scripts need a different recogniser, which is a later decision.
class MlKitOcrEngine implements OcrEngine {
  MlKitOcrEngine({TextRecognizer? recognizer})
      : _recognizer = recognizer ??
            TextRecognizer(script: TextRecognitionScript.latin);

  final TextRecognizer _recognizer;

  @override
  Future<List<String>> recognize(OcrInput input) async {
    final image = InputImage.fromBytes(
      bytes: input.bytes,
      metadata: InputImageMetadata(
        size: Size(input.width.toDouble(), input.height.toDouble()),
        rotation: InputImageRotationValue.fromRawValue(input.rotationDegrees) ??
            InputImageRotation.rotation0deg,
        format: switch (input.format) {
          OcrPixelFormat.nv21 => InputImageFormat.nv21,
          OcrPixelFormat.bgra8888 => InputImageFormat.bgra8888,
        },
        bytesPerRow: input.bytesPerRow,
      ),
    );
    final result = await _recognizer.processImage(image);
    return [
      for (final block in result.blocks)
        for (final line in block.lines)
          if (line.text.trim().isNotEmpty) line.text.trim(),
    ];
  }

  @override
  Future<void> dispose() => _recognizer.close();
}

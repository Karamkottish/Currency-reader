import 'package:flutter/foundation.dart';

/// Measures a step and prints it. Use for the device log (OCR ms, TTFT...).
Future<T> timed<T>(String label, Future<T> Function() body) async {
  final sw = Stopwatch()..start();
  try {
    return await body();
  } finally {
    debugPrint('[perf] $label: ${sw.elapsedMilliseconds} ms');
  }
}

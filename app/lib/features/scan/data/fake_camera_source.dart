import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../../core/errors/failure.dart';
import '../../../core/result/result.dart';
import '../domain/ocr_reading.dart';
import 'camera_source.dart';
import 'viewfinder_stand_in.dart';

/// A camera that is not a camera. Used by tests and by platforms without the
/// camera plugin (web, desktop), where it draws the stand-in picture.
class FakeCameraSource implements CameraSource {
  FakeCameraSource({this.failure});

  /// When set, [open] fails with this until [failure] is cleared.
  Failure? failure;

  int openCalls = 0;
  int pauseCalls = 0;
  int resumeCalls = 0;
  bool flashOn = false;
  bool hasFlash = true;

  final _readings = StreamController<OcrReading>.broadcast();

  /// Test helper: pretend OCR read this text.
  void emit(List<String> lines, {int ms = 40}) => _readings.add(
        OcrReading(lines: lines, elapsed: Duration(milliseconds: ms)),
      );

  @override
  Stream<OcrReading> get readings => _readings.stream;

  @override
  Future<Result<void>> open() async {
    openCalls++;
    final f = failure;
    return f == null ? const Ok<void>(null) : Err<void>(f);
  }

  @override
  Future<void> pause() async => pauseCalls++;

  @override
  Future<void> resume() async => resumeCalls++;

  @override
  Future<bool> setFlash(bool on) async {
    if (!hasFlash) return false;
    flashOn = on;
    return true;
  }

  @override
  Widget buildPreview(Rect guide) => ViewfinderStandIn(frame: guide);

  @override
  Future<void> dispose() => _readings.close();
}

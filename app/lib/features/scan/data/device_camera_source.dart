import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../../../app/theme/tokens.dart';
import '../../../core/errors/failure.dart';
import '../../../core/result/result.dart';
import '../domain/ocr_reading.dart';
import 'camera_rotation.dart';
import 'camera_source.dart';
import 'frame_gate.dart';
import 'ocr/ml_kit_ocr_engine.dart';
import 'ocr/ocr_engine.dart';

/// The phone's back camera at 720p, with every third frame read by OCR.
class DeviceCameraSource implements CameraSource {
  DeviceCameraSource({OcrEngine? ocr}) : _ocr = ocr ?? MlKitOcrEngine();

  final OcrEngine _ocr;
  final _gate = FrameGate(every: 3);
  final _readings = StreamController<OcrReading>.broadcast();

  CameraController? _controller;
  Future<Result<void>>? _opening;
  bool _streaming = false;
  bool _disposed = false;

  bool get _isAndroid => defaultTargetPlatform == TargetPlatform.android;

  @override
  Stream<OcrReading> get readings => _readings.stream;

  @override
  Future<Result<void>> open() => _opening ??= _open();

  Future<Result<void>> _open() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return _fail(const CameraUnavailable());

      final description = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        description,
        ResolutionPreset.high, // 720p: enough for printed text, cheap to read
        enableAudio: false,
        imageFormatGroup:
            _isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
      );
      await controller.initialize();
      if (_disposed) {
        await controller.dispose();
        return _fail(const CameraUnavailable());
      }
      _controller = controller;
      await resume();
      return const Ok<void>(null);
    } on CameraException catch (e) {
      debugPrint('Camera error ${e.code}: ${e.description}');
      return _fail(_failureFor(e));
    } catch (e) {
      debugPrint('Camera failed to start: $e');
      return _fail(const CameraUnavailable());
    }
  }

  /// Lets the next [open] try again after a failure.
  Result<void> _fail(Failure failure) {
    _opening = null;
    return Err<void>(failure);
  }

  static Failure _failureFor(CameraException e) => switch (e.code) {
        'CameraAccessDenied' => const CameraDenied(),
        'CameraAccessDeniedWithoutPrompt' ||
        'CameraAccessRestricted' =>
          const CameraDenied(permanent: true),
        _ => const CameraUnavailable(),
      };

  @override
  Future<void> resume() async {
    final controller = _controller;
    if (controller == null || _streaming || _disposed) return;
    _streaming = true;
    try {
      await controller.startImageStream(_onFrame);
    } catch (e) {
      _streaming = false;
      debugPrint('Could not start the image stream: $e');
    }
  }

  @override
  Future<void> pause() async {
    final controller = _controller;
    if (controller == null || !_streaming) return;
    _streaming = false;
    try {
      await controller.stopImageStream();
    } catch (e) {
      debugPrint('Could not stop the image stream: $e');
    }
  }

  Future<void> _onFrame(CameraImage image) async {
    if (!_gate.tryAcquire()) return;
    try {
      final input = _toInput(image);
      if (input == null) return;
      final clock = Stopwatch()..start();
      final lines = await _ocr.recognize(input);
      clock.stop();
      if (_readings.isClosed) return;
      debugPrint('[perf] ocr: ${clock.elapsedMilliseconds} ms, '
          '${lines.length} lines');
      _readings.add(OcrReading(lines: lines, elapsed: clock.elapsed));
    } catch (e) {
      debugPrint('OCR failed on a frame: $e');
    } finally {
      _gate.release();
    }
  }

  OcrInput? _toInput(CameraImage image) {
    final controller = _controller;
    if (controller == null) return null;
    // Both platforms deliver this format as a single plane.
    if (image.planes.length != 1) return null;

    final rotation = ocrRotationDegrees(
      isAndroid: _isAndroid,
      sensorOrientation: controller.description.sensorOrientation,
      deviceOrientation: controller.value.deviceOrientation,
      frontFacing:
          controller.description.lensDirection == CameraLensDirection.front,
    );
    if (rotation == null) return null;

    final plane = image.planes.first;
    return OcrInput(
      bytes: plane.bytes,
      width: image.width,
      height: image.height,
      bytesPerRow: plane.bytesPerRow,
      rotationDegrees: rotation,
      format: _isAndroid ? OcrPixelFormat.nv21 : OcrPixelFormat.bgra8888,
    );
  }

  @override
  Future<bool> setFlash(bool on) async {
    final controller = _controller;
    if (controller == null) return false;
    try {
      await controller.setFlashMode(on ? FlashMode.torch : FlashMode.off);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget buildPreview(Rect guide) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const ColoredBox(color: Neutral.n950);
    }
    // Fill the area and crop the overflow, like a camera app.
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: controller.value.aspectRatio * 100,
          height: 100,
          child: CameraPreview(controller),
        ),
      ),
    );
  }

  @override
  Future<void> dispose() async {
    _disposed = true;
    await pause();
    await _controller?.dispose();
    _controller = null;
    await _readings.close();
    await _ocr.dispose();
  }
}

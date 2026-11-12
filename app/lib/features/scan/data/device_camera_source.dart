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

/// Build with `--dart-define=SHOW_OCR=true` to see what OCR reads on screen
/// and in the log, in a release build. Off by default, because the text comes
/// from whatever the camera is looking at.
const showOcrText = kDebugMode || bool.fromEnvironment('SHOW_OCR');

/// The phone's camera at 720p, with every third frame read by OCR. Starts on
/// the back camera and can switch to the front one.
class DeviceCameraSource implements CameraSource {
  DeviceCameraSource({OcrEngine? ocr}) : _ocr = ocr ?? MlKitOcrEngine();

  final OcrEngine _ocr;
  final _gate = FrameGate(every: 3);
  final _readings = StreamController<OcrReading>.broadcast();
  final _changes = ValueNotifier<int>(0);

  List<CameraDescription> _cameras = const [];
  int _index = 0;
  CameraController? _controller;
  Future<Result<void>>? _opening;
  bool _streaming = false;
  bool _switching = false;
  bool _disposed = false;

  bool get _isAndroid => defaultTargetPlatform == TargetPlatform.android;

  @override
  Stream<OcrReading> get readings => _readings.stream;

  @override
  Listenable get changes => _changes;

  @override
  bool get canSwitchCamera => _cameras.length > 1;

  @override
  Future<Result<void>> open() => _opening ??= _open();

  Future<Result<void>> _open() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return _fail(const CameraUnavailable());
      _cameras = cameras;
      final back = cameras.indexWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
      );
      _index = back == -1 ? 0 : back;

      final controller = await _create(_cameras[_index]);
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

  Future<CameraController> _create(CameraDescription description) async {
    final controller = CameraController(
      description,
      ResolutionPreset.high, // 720p: enough for printed text, cheap to read
      enableAudio: false,
      imageFormatGroup:
          _isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
    );
    await controller.initialize();
    return controller;
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
  Future<bool> switchCamera() async {
    if (!canSwitchCamera || _switching || _disposed || _controller == null) {
      return false;
    }
    _switching = true;
    final wasStreaming = _streaming;
    final previousIndex = _index;
    try {
      await pause();
      // Release the camera before opening the next one: many phones cannot
      // have both open at once.
      final old = _controller;
      _controller = null;
      _changes.value++; // preview shows a dark box while switching
      await old?.dispose();

      final next = (previousIndex + 1) % _cameras.length;
      try {
        _controller = await _create(_cameras[next]);
        _index = next;
      } catch (e) {
        debugPrint('Could not start the other camera: $e');
        // Go back to the camera that was working.
        _controller = await _create(_cameras[previousIndex]);
        _index = previousIndex;
        return false;
      } finally {
        _changes.value++;
        if (wasStreaming) await resume();
      }
      return true;
    } catch (e) {
      debugPrint('Switching cameras failed: $e');
      return false;
    } finally {
      _switching = false;
    }
  }

  @override
  Future<void> resume() async {
    final controller = _controller;
    if (controller == null || _streaming || _disposed) return;
    _streaming = true;
    try {
      // Each frame is tied to the camera that produced it, so a frame still
      // being read when the camera switches cannot use the new one's rotation.
      await controller.startImageStream((image) => _onFrame(controller, image));
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

  Future<void> _onFrame(CameraController controller, CameraImage image) async {
    if (!_gate.tryAcquire()) return;
    try {
      final input = _toInput(controller, image);
      if (input == null) return;
      final clock = Stopwatch()..start();
      final lines = await _ocr.recognize(input);
      clock.stop();
      // The camera may have been switched while this frame was being read.
      if (_readings.isClosed || !identical(controller, _controller)) return;
      debugPrint('[perf] ocr: ${clock.elapsedMilliseconds} ms, '
          '${lines.length} lines');
      if (showOcrText && lines.isNotEmpty) {
        debugPrint('[ocr] ${lines.take(6).join(' | ')}');
      }
      _readings.add(OcrReading(lines: lines, elapsed: clock.elapsed));
    } catch (e) {
      debugPrint('OCR failed on a frame: $e');
    } finally {
      _gate.release();
    }
  }

  OcrInput? _toInput(CameraController controller, CameraImage image) {
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
    _changes.dispose();
    await _readings.close();
    await _ocr.dispose();
  }
}

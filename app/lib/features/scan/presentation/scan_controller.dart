import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/result/result.dart';
import '../data/camera_source.dart';
import '../data/device_camera_source.dart';
import '../data/fake_camera_source.dart';
import '../domain/ocr_reading.dart';
import 'scan_state.dart';

/// The one place the camera implementation is chosen. Phones get the real
/// camera; the web, desktop and tests get the fake (tests override it too).
final cameraSourceProvider = Provider<CameraSource>((ref) {
  final onPhone = !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);
  final source = onPhone ? DeviceCameraSource() : FakeCameraSource();
  ref.onDispose(source.dispose);
  return source;
});

/// Text read from the camera, newest first. Only the debug readout uses it
/// until currency recognition (Stage 2) arrives.
final ocrReadingProvider = StreamProvider.autoDispose<OcrReading>(
  (ref) => ref.watch(cameraSourceProvider).readings,
);

class ScanController extends Notifier<ScanState> {
  Timer? _timer;

  CameraSource get _camera => ref.read(cameraSourceProvider);

  @override
  ScanState build() {
    ref.onDispose(() => _timer?.cancel());
    return const ScanIdle();
  }

  /// Opens the camera. Also what "Try again" calls after a failure.
  Future<void> openCamera() async {
    _timer?.cancel();
    state = const ScanIdle();
    final result = await _camera.open();
    if (!ref.mounted) return;
    state = switch (result) {
      Ok<void>() => const ScanSearching(),
      Err<void>(:final failure) => ScanFailed(failure),
    };
  }

  /// Stops reading frames while another screen is on top or the app is in
  /// the background.
  Future<void> pause() async {
    _timer?.cancel();
    if (state is ScanFailed) return;
    state = const ScanIdle();
    await _camera.pause();
  }

  /// Undoes [pause]. If the camera had failed (for example the user went to
  /// Settings to allow it), try opening it again.
  Future<void> resume() async {
    if (state is ScanFailed) return openCamera();
    await _camera.resume();
    if (!ref.mounted) return;
    state = const ScanSearching();
  }

  /// Back to looking for a note, e.g. after the result sheet closes.
  void start() {
    _timer?.cancel();
    state = const ScanSearching();
  }

  /// Stage 1 only: currency recognition does not exist yet, so the shutter
  /// walks through the states a real scan will produce (searching, locked,
  /// confirmed) and the sheet shows labelled sample data. Stage 2 replaces
  /// this with automatic locking.
  void runDemoScan() {
    _timer?.cancel();
    state = const ScanSearching(hint: 'Hold steady…', capturing: true);
    _timer = Timer(const Duration(milliseconds: 1800), () {
      state = const ScanLocked(currencyId: 'demo', confidence: 0.93);
      _timer = Timer(const Duration(milliseconds: 1000), () {
        state = const ScanConfirmed(currencyId: 'demo');
      });
    });
  }
}

final scanControllerProvider =
    NotifierProvider<ScanController, ScanState>(ScanController.new);

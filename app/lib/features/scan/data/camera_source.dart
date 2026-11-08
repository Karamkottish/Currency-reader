import 'package:flutter/widgets.dart';

import '../../../core/result/result.dart';
import '../domain/ocr_reading.dart';

/// The only thing the scan feature knows about the camera.
///
/// [DeviceCameraSource] uses the phone's camera and ML Kit. [FakeCameraSource]
/// stands in for tests and for platforms without a camera plugin.
abstract class CameraSource {
  /// Starts the camera and OCR. Safe to call again; an already open camera
  /// returns [Ok]. Returns [Err] with a user-readable failure otherwise.
  Future<Result<void>> open();

  /// Stops frame processing, e.g. while another screen is on top or the app
  /// is in the background. The camera stays open.
  Future<void> pause();

  /// Restarts frame processing after [pause].
  Future<void> resume();

  /// Text read from camera frames, a few times a second.
  Stream<OcrReading> get readings;

  /// Turns the torch on or off. False if this camera has no torch.
  Future<bool> setFlash(bool on);

  /// The live picture. [guide] is where the note frame sits, used by the
  /// stand-in picture; the real camera ignores it.
  Widget buildPreview(Rect guide);

  /// Releases the camera. The source cannot be used afterwards.
  Future<void> dispose();
}

import 'package:flutter/services.dart' show DeviceOrientation;

/// Clockwise rotation, in degrees, that turns a raw camera frame upright for
/// text recognition. Returns null when it cannot be worked out.
///
/// A wrong value is the most common reason OCR "works in the preview but
/// reads nothing": the text is sideways in the frame ML Kit receives.
int? ocrRotationDegrees({
  required bool isAndroid,
  required int sensorOrientation,
  required DeviceOrientation deviceOrientation,
  required bool frontFacing,
}) {
  // iOS delivers frames already corrected for the device's orientation.
  if (!isAndroid) return sensorOrientation;

  final device = switch (deviceOrientation) {
    DeviceOrientation.portraitUp => 0,
    DeviceOrientation.landscapeLeft => 90,
    DeviceOrientation.portraitDown => 180,
    DeviceOrientation.landscapeRight => 270,
  };
  return frontFacing
      ? (sensorOrientation + device) % 360
      : (sensorOrientation - device + 360) % 360;
}

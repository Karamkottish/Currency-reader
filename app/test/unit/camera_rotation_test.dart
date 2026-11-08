import 'package:currency_reader/features/scan/data/camera_rotation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

int? android(int sensor, DeviceOrientation device, {bool front = false}) =>
    ocrRotationDegrees(
      isAndroid: true,
      sensorOrientation: sensor,
      deviceOrientation: device,
      frontFacing: front,
    );

void main() {
  group('Android back camera (sensor mounted at 90 degrees)', () {
    test('portrait needs a quarter turn', () {
      expect(android(90, DeviceOrientation.portraitUp), 90);
    });

    test('rotating the phone changes the correction', () {
      expect(android(90, DeviceOrientation.landscapeLeft), 0);
      expect(android(90, DeviceOrientation.portraitDown), 270);
      expect(android(90, DeviceOrientation.landscapeRight), 180);
    });
  });

  group('Android front camera is mirrored', () {
    test('adds the device rotation instead of subtracting it', () {
      expect(android(270, DeviceOrientation.portraitUp, front: true), 270);
      expect(android(270, DeviceOrientation.landscapeLeft, front: true), 0);
    });
  });

  test('always returns a value in 0..359', () {
    for (final sensor in [0, 90, 180, 270]) {
      for (final device in DeviceOrientation.values) {
        for (final front in [false, true]) {
          final r = android(sensor, device, front: front)!;
          expect(r, inInclusiveRange(0, 359));
          expect(r % 90, 0);
        }
      }
    }
  });

  test('iOS frames only need the sensor orientation', () {
    expect(
      ocrRotationDegrees(
        isAndroid: false,
        sensorOrientation: 90,
        deviceOrientation: DeviceOrientation.landscapeLeft,
        frontFacing: false,
      ),
      90,
    );
  });
}

import 'package:currency_reader/app/app.dart';
import 'package:currency_reader/core/errors/failure.dart';
import 'package:currency_reader/features/scan/data/fake_camera_source.dart';
import 'package:currency_reader/features/scan/presentation/scan_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> setScreen(
  WidgetTester tester,
  Size size, {
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
}

/// Starts the app with a fake camera, so no plugin is involved.
Future<FakeCameraSource> openApp(
  WidgetTester tester, {
  FakeCameraSource? camera,
}) async {
  final source = camera ?? FakeCameraSource();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [cameraSourceProvider.overrideWithValue(source)],
      child: const CurrencyApp(),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
  // A second frame lets the hint's fade-out finish, so tests see one copy.
  await tester.pump(const Duration(milliseconds: 300));
  return source;
}

/// Runs a demo scan up to the moment the sheet has fully opened.
Future<void> scanToSheet(WidgetTester tester) async {
  await tester.tap(find.bySemanticsLabel('Scan note'));
  await tester.pump(const Duration(milliseconds: 1900));
  await tester.pump(const Duration(milliseconds: 1100));
  await tester.pump(const Duration(milliseconds: 600));
}

const phone = Size(390, 844);

void main() {
  testWidgets('opens straight on the scan screen', (tester) async {
    await setScreen(tester, phone);
    await openApp(tester);

    expect(find.text('Point at a banknote'), findsOneWidget);
    expect(find.bySemanticsLabel('Scan note'), findsOneWidget);
    expect(find.text('Saved'), findsOneWidget);
    expect(find.text('Ask'), findsOneWidget);
  });

  testWidgets('a scan locks on, then shows the result', (tester) async {
    await setScreen(tester, phone);
    await openApp(tester);

    await tester.tap(find.bySemanticsLabel('Scan note'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Hold steady…'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1800));
    expect(find.text('Got it'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1100));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('€20'), findsOneWidget);
    expect(find.text('Sample data'), findsOneWidget);
    expect(find.text('Gathering facts…'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pump(const Duration(milliseconds: 300));
    expect(
      find.text('Saved answer. Checking for updates…'),
      findsOneWidget,
    );

    await tester.pump(const Duration(milliseconds: 1700));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Up to date'), findsOneWidget);

    await tester.tap(find.text('Scan another'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Point at a banknote'), findsOneWidget);
  });

  testWidgets('Ask answers and can be left mid-answer', (tester) async {
    await setScreen(tester, phone);
    await openApp(tester);

    await tester.tap(find.text('Ask'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text('What is this note made of?'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byTooltip('Stop'), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('placeholder answer'), findsOneWidget);
    expect(find.byTooltip('Send'), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Point at a banknote'), findsOneWidget);
  });

  group('camera', () {
    testWidgets('opens once at start and shows the viewfinder', (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(tester);
      expect(camera.openCalls, 1);
      expect(find.text('Point at a banknote'), findsOneWidget);
    });

    testWidgets('permission denied: says why and Try again recovers',
        (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(
        tester,
        camera: FakeCameraSource(failure: const CameraDenied()),
      );

      expect(find.text('Camera is off'), findsOneWidget);
      expect(
        find.text('Currency Reader needs the camera to read banknotes.'),
        findsOneWidget,
      );
      // nothing can be scanned while the camera is off
      await tester.tap(find.bySemanticsLabel('Scan note'));
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('€20'), findsNothing);

      camera.failure = null; // the user allowed it
      await tester.tap(find.text('Try again'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(camera.openCalls, 2);
      expect(find.text('Camera is off'), findsNothing);
      expect(find.text('Point at a banknote'), findsOneWidget);
    });

    testWidgets('blocked for good: tells the user to use Settings',
        (tester) async {
      await setScreen(tester, phone);
      await openApp(
        tester,
        camera: FakeCameraSource(failure: const CameraDenied(permanent: true)),
      );
      expect(find.textContaining('phone settings'), findsOneWidget);
    });

    testWidgets('camera cannot start: different title, same way out',
        (tester) async {
      await setScreen(tester, phone);
      await openApp(
        tester,
        camera: FakeCameraSource(failure: const CameraUnavailable()),
      );
      expect(find.text('Camera unavailable'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });

    testWidgets('frames stop while another screen is open', (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(tester);

      await tester.tap(find.text('Saved'));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      expect(camera.pauseCalls, 1);
      expect(camera.resumeCalls, 0);

      await tester.tap(find.byType(BackButton));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      expect(camera.resumeCalls, 1);
      expect(find.text('Point at a banknote'), findsOneWidget);
    });

    testWidgets('frames stop in the background and restart on return',
        (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(tester);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(milliseconds: 100));
      expect(camera.pauseCalls, 1);
      expect(find.text('Starting camera…'), findsOneWidget);

      // Pausing and resuming within the 200 ms fade must not clash (this is
      // the case the hint's unique keys exist for).
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 100));
      expect(camera.resumeCalls, 1);
      expect(tester.takeException(), isNull);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Point at a banknote'), findsOneWidget);
    });

    testWidgets('coming back from Settings retries a failed camera',
        (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(
        tester,
        camera: FakeCameraSource(failure: const CameraDenied(permanent: true)),
      );
      expect(find.text('Camera is off'), findsOneWidget);

      camera.failure = null; // allowed in Settings
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Camera is off'), findsNothing);
      expect(find.text('Point at a banknote'), findsOneWidget);
    });

    testWidgets('flash toggles, and a phone without flash says so',
        (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(tester);

      await tester.tap(find.byTooltip('Turn flash on'));
      await tester.pump();
      expect(camera.flashOn, isTrue);
      expect(find.byTooltip('Turn flash off'), findsOneWidget);

      await tester.tap(find.byTooltip('Turn flash off'));
      await tester.pump();
      expect(camera.flashOn, isFalse);

      camera.hasFlash = false;
      await tester.tap(find.byTooltip('Turn flash on'));
      await tester.pump();
      expect(find.text("This phone's camera has no flash."), findsOneWidget);
      expect(find.byTooltip('Turn flash on'), findsOneWidget);
    });

    testWidgets('debug readout shows what OCR read and how long it took',
        (tester) async {
      await setScreen(tester, phone);
      final camera = await openApp(tester);
      expect(find.textContaining('OCR '), findsNothing);

      camera.emit(['TWENTY EURO', 'SN 1234567890'], ms: 87);
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('OCR 87 ms · 2 lines'), findsOneWidget);
      expect(find.textContaining('TWENTY EURO'), findsOneWidget);
    });
  });

  testWidgets('Saved shows a useful empty state', (tester) async {
    await setScreen(tester, phone);
    await openApp(tester);

    await tester.tap(find.text('Saved'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Nothing saved yet'), findsOneWidget);

    await tester.tap(find.text('Scan a note'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Point at a banknote'), findsOneWidget);
  });

  // Any layout overflow fails these tests automatically.
  for (final brightness in Brightness.values) {
    for (final (name, size, scale) in [
      ('small phone', const Size(320, 568), 1.0),
      ('small phone, largest text', const Size(320, 568), 2.0),
      ('phone', phone, 1.0),
      ('phone, largest text', phone, 2.0),
      ('landscape', const Size(780, 360), 1.0),
      ('landscape, large text', const Size(780, 360), 1.5),
      ('tablet', const Size(820, 1180), 1.0),
    ]) {
      testWidgets('no overflow: $name, ${brightness.name}', (tester) async {
        await setScreen(
          tester,
          size,
          brightness: brightness,
          textScale: scale,
        );
        await openApp(tester);
        expect(tester.takeException(), isNull);

        await scanToSheet(tester);
        await tester.pump(const Duration(milliseconds: 1400));
        expect(find.text('Sample data'), findsOneWidget);
        expect(tester.takeException(), isNull);

        await tester.pump(const Duration(seconds: 2));
      });
    }

    testWidgets('accessibility guidelines: ${brightness.name}', (tester) async {
      final semantics = tester.ensureSemantics();
      await setScreen(tester, phone, brightness: brightness);
      await openApp(tester);

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));

      await scanToSheet(tester);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 400));

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      semantics.dispose();
    });
  }

  testWidgets('reduce motion: no sweep, and the flow still completes',
      (tester) async {
    await setScreen(tester, phone);
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    await openApp(tester);
    await tester.pump(const Duration(seconds: 1));
    expect(tester.hasRunningAnimations, isFalse);

    await scanToSheet(tester);
    expect(find.text('Sample data'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
  });
}

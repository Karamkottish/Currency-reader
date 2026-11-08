import 'package:currency_reader/app/app.dart';
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

Future<void> openApp(WidgetTester tester) async {
  await tester.pumpWidget(const ProviderScope(child: CurrencyApp()));
  await tester.pump(const Duration(milliseconds: 300));
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

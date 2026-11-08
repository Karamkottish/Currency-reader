import 'package:currency_reader/app/theme/app_theme.dart';
import 'package:currency_reader/app/theme/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

Color over(Color top, Color bottom) => Color.alphaBlend(top, bottom);

void main() {
  for (final (name, theme) in [
    ('light', AppTheme.light),
    ('dark', AppTheme.dark),
  ]) {
    final s = theme.colorScheme;

    group('$name theme meets WCAG contrast', () {
      test('body and secondary text, 4.5:1', () {
        for (final bg in [s.surface, theme.scaffoldBackgroundColor]) {
          expect(contrast(s.onSurface, bg), greaterThanOrEqualTo(4.5));
          expect(contrast(s.onSurfaceVariant, bg), greaterThanOrEqualTo(4.5));
        }
        expect(
          contrast(s.onSurfaceVariant, s.surfaceContainer),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('accent button label, 4.5:1', () {
        expect(contrast(s.onTertiary, s.tertiary), greaterThanOrEqualTo(4.5));
      });

      test('control borders, 3:1', () {
        expect(contrast(s.outline, s.surface), greaterThanOrEqualTo(3));
      });
    });
  }

  group('text on the camera picture', () {
    test('white text stays legible even over a pure white scene', () {
      final worstCase = over(CameraChrome.scrim, Colors.white);
      expect(
        contrast(CameraChrome.foreground, worstCase),
        greaterThanOrEqualTo(4.5),
      );
    });

    test('the lock badge check is clearly visible', () {
      expect(contrast(Signal.onYellow, Signal.yellow), greaterThanOrEqualTo(7));
    });
  });
}

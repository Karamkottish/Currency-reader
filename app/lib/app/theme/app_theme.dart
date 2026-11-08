import 'package:flutter/material.dart';

import 'tokens.dart';

/// Light and dark themes, following the phone's setting.
///
/// The colour schemes are written out by hand. `ColorScheme.fromSeed` would
/// tint every surface with the seed colour, which is the default-Material
/// look this design avoids. No font is set, so each platform uses its own
/// (Roboto on Android, San Francisco on iOS).
abstract class AppTheme {
  static ThemeData get light => _build(
        const ColorScheme(
          brightness: Brightness.light,
          primary: Neutral.n900,
          onPrimary: Neutral.n50,
          secondary: Neutral.n700,
          onSecondary: Neutral.n50,
          tertiary: Signal.yellow,
          onTertiary: Signal.onYellow,
          error: Color(0xFFB91C1C),
          onError: Colors.white,
          surface: Colors.white,
          onSurface: Neutral.n900,
          onSurfaceVariant: Neutral.n600,
          surfaceContainerLowest: Colors.white,
          surfaceContainerLow: Neutral.n50,
          surfaceContainer: Neutral.n100,
          surfaceContainerHigh: Neutral.n200,
          surfaceContainerHighest: Neutral.n300,
          outline: Neutral.n500,
          outlineVariant: Neutral.n200,
          shadow: Colors.black,
          scrim: Colors.black,
          inverseSurface: Neutral.n900,
          onInverseSurface: Neutral.n50,
          inversePrimary: Neutral.n300,
          surfaceTint: Colors.transparent,
        ),
        background: Colors.white,
      );

  static ThemeData get dark => _build(
        const ColorScheme(
          brightness: Brightness.dark,
          primary: Neutral.n50,
          onPrimary: Neutral.n900,
          secondary: Neutral.n300,
          onSecondary: Neutral.n900,
          tertiary: Signal.yellow,
          onTertiary: Signal.onYellow,
          error: Color(0xFFF87171),
          onError: Neutral.n950,
          surface: Neutral.n900,
          onSurface: Neutral.n50,
          onSurfaceVariant: Neutral.n400,
          surfaceContainerLowest: Neutral.n950,
          surfaceContainerLow: Neutral.n900,
          surfaceContainer: Neutral.n800,
          surfaceContainerHigh: Neutral.n800,
          surfaceContainerHighest: Neutral.n700,
          outline: Neutral.n500,
          outlineVariant: Neutral.n700,
          shadow: Colors.black,
          scrim: Colors.black,
          inverseSurface: Neutral.n50,
          onInverseSurface: Neutral.n900,
          inversePrimary: Neutral.n700,
          surfaceTint: Colors.transparent,
        ),
        background: Neutral.n950,
      );

  // Sizes and line heights follow Tailwind's text scale.
  static const _text = TextTheme(
    displayLarge: TextStyle(
      fontSize: 48,
      height: 1,
      fontWeight: FontWeight.w600,
      letterSpacing: -1,
    ),
    headlineSmall: TextStyle(
      fontSize: 24,
      height: 32 / 24,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.3,
    ),
    titleLarge: TextStyle(
      fontSize: 20,
      height: 28 / 20,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.2,
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      height: 24 / 16,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
    ),
    titleSmall: TextStyle(
      fontSize: 14,
      height: 20 / 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
    ),
    bodyLarge: TextStyle(fontSize: 16, height: 24 / 16, letterSpacing: 0),
    bodyMedium: TextStyle(fontSize: 14, height: 20 / 14, letterSpacing: 0),
    bodySmall: TextStyle(fontSize: 12, height: 16 / 12, letterSpacing: 0),
    labelLarge: TextStyle(
      fontSize: 16,
      height: 24 / 16,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
    ),
    labelMedium: TextStyle(
      fontSize: 12,
      height: 16 / 12,
      fontWeight: FontWeight.w500,
      letterSpacing: 0,
    ),
  );

  static ThemeData _build(ColorScheme scheme, {required Color background}) {
    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(Radii.xl),
    );
    const buttonSize = Size(64, 52);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      textTheme: _text,
      scaffoldBackgroundColor: background,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: _text.titleLarge?.copyWith(color: scheme.onSurface),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      // The accent button. There is at most one per screen.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: scheme.tertiary,
          foregroundColor: scheme.onTertiary,
          minimumSize: buttonSize,
          shape: buttonShape,
          textStyle: _text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.onSurface,
          side: BorderSide(color: scheme.outline),
          minimumSize: buttonSize,
          shape: buttonShape,
          textStyle: _text.labelLarge,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: scheme.outline,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.x3l)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        hintStyle: _text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: Space.s4,
          vertical: Space.s3,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.x3l),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.x3l),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.x3l),
          borderSide: BorderSide(color: scheme.onSurface, width: 2),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.onSurfaceVariant,
      ),
    );
  }
}

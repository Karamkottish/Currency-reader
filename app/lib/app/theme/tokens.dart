import 'package:flutter/material.dart';

/// Achromatic scale from Tailwind CSS v4 (`--color-neutral-*`).
///
/// Neutral on purpose: this is a camera app, and tinted chrome would colour
/// the way people see the banknote in front of them.
abstract class Neutral {
  static const n50 = Color(0xFFFAFAFA);
  static const n100 = Color(0xFFF5F5F5);
  static const n200 = Color(0xFFE5E5E5);
  static const n300 = Color(0xFFD4D4D4);
  static const n400 = Color(0xFFA1A1A1);
  static const n500 = Color(0xFF737373);
  static const n600 = Color(0xFF525252);
  static const n700 = Color(0xFF404040);
  static const n800 = Color(0xFF262626);
  static const n900 = Color(0xFF171717);
  static const n950 = Color(0xFF0A0A0A);
}

/// The single accent. Rule: it appears once per screen, on the one thing
/// that matters right now. Yellow rather than green because a green lock
/// would vanish against a green banknote.
abstract class Signal {
  static const yellow = Color(0xFFFFD000);
  static const onYellow = Neutral.n950;
}

/// Colours drawn over the live picture. These do not change with the theme:
/// the picture is the background in both light and dark mode.
abstract class CameraChrome {
  static const foreground = Colors.white;

  /// 62% black. Over a pure white scene, white text still measures 6:1.
  static const scrim = Color(0x9E000000);

  /// Backing for icon buttons that sit on the picture.
  static const control = Color(0x80000000);

  /// Thin outline that keeps white strokes visible on a bright note.
  static const keyline = Color(0x4D000000);
}

/// 4-point spacing, named after Tailwind's scale (`s4` is 4 x 4 = 16).
abstract class Space {
  static const s1 = 4.0;
  static const s2 = 8.0;
  static const s3 = 12.0;
  static const s4 = 16.0;
  static const s5 = 20.0;
  static const s6 = 24.0;
  static const s8 = 32.0;
  static const s12 = 48.0;
}

/// Tailwind's radius scale.
abstract class Radii {
  static const lg = 8.0;
  static const xl = 12.0;
  static const x2l = 16.0;
  static const x3l = 24.0;
  static const full = 999.0;
}

abstract class IconSize {
  static const sm = 16.0;
  static const md = 24.0;
}

/// Durations and curves. Exits are faster than entrances.
abstract class Motion {
  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 320);

  // Tailwind's --ease-out and --ease-in-out.
  static const easeOut = Cubic(0, 0, 0.2, 1);
  static const easeInOut = Cubic(0.4, 0, 0.2, 1);
}

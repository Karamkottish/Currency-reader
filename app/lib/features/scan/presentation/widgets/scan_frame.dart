import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';

import '../../../../app/theme/tokens.dart';

enum FrameMood { searching, locked, failed }

/// The note frame and its scanning animation.
///
/// While searching, a thin line reads across the note from left to right and
/// leaves fine engraving-like hatch marks that fade behind it. On lock the
/// marks clear, the corners close in and turn signal yellow, and a check mark
/// draws itself. Everything stops under the system's reduce-motion setting.
class ScanFrame extends StatefulWidget {
  const ScanFrame({super.key, required this.mood});

  final FrameMood mood;

  @override
  State<ScanFrame> createState() => _ScanFrameState();
}

class _ScanFrameState extends State<ScanFrame> with TickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  );
  late final AnimationController _lock = AnimationController(
    vsync: this,
    duration: Motion.slow,
    reverseDuration: Motion.fast,
  );
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context);
    _sync();
  }

  @override
  void didUpdateWidget(ScanFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.mood != widget.mood) _sync();
  }

  void _sync() {
    final scanning = widget.mood == FrameMood.searching && !_reduceMotion;
    if (scanning) {
      if (!_sweep.isAnimating) _sweep.repeat();
    } else {
      _sweep
        ..stop()
        ..value = 0;
    }
    if (widget.mood == FrameMood.locked) {
      _reduceMotion ? _lock.value = 1 : _lock.forward();
    } else {
      _reduceMotion ? _lock.value = 0 : _lock.reverse();
    }
  }

  @override
  void dispose() {
    _sweep.dispose();
    _lock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _FramePainter(sweep: _sweep, lock: _lock),
      ),
    );
  }
}

class _FramePainter extends CustomPainter {
  _FramePainter({required this.sweep, required this.lock})
      : super(repaint: Listenable.merge([sweep, lock]));

  final Animation<double> sweep;
  final Animation<double> lock;

  static const _arm = 32.0;
  static const _radius = Radii.x2l;
  static const _hatchGap = 7.0;

  @override
  void paint(Canvas canvas, Size size) {
    final locked = Motion.easeOut.transform(lock.value);
    final rect = (Offset.zero & size).deflate(lerpDouble(0, 8, locked)!);
    final rrect = RRect.fromRectAndRadius(
      rect,
      const Radius.circular(_radius),
    );

    if (sweep.value > 0 && locked < 0.99) {
      _paintSweep(canvas, rect, rrect, 1 - locked);
    }

    if (locked > 0.01) {
      canvas.drawRRect(
        rrect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = Signal.yellow.withValues(alpha: locked),
      );
    }

    _paintCorners(canvas, rect, locked);

    if (lock.value > 0.01) _paintBadge(canvas, rect.center, locked);
  }

  void _paintSweep(Canvas canvas, Rect rect, RRect rrect, double strength) {
    final p = sweep.value;
    const travelEnd = 0.84;
    final t = Motion.easeInOut.transform((p / travelEnd).clamp(0.0, 1.0));
    final fadeIn = (p / 0.06).clamp(0.0, 1.0);
    final fadeOut = ((1 - p) / 0.14).clamp(0.0, 1.0);
    final alpha = fadeIn * fadeOut * strength;
    if (alpha <= 0.01) return;

    final headX = rect.left + rect.width * t;
    final top = rect.top + Space.s3;
    final bottom = rect.bottom - Space.s3;
    final trail = rect.width * 0.42;

    canvas.save();
    canvas.clipRRect(rrect);

    final hatch = Paint()..strokeWidth = 1;
    for (var x = rect.left + _hatchGap; x < headX; x += _hatchGap) {
      final behind = headX - x;
      if (behind > trail) continue;
      final decay = math.pow(1 - behind / trail, 1.5).toDouble();
      // A dark line beside each white one keeps it visible on any note.
      hatch.color = Colors.black.withValues(alpha: 0.35 * decay * alpha);
      canvas.drawLine(Offset(x + 1, top), Offset(x + 1, bottom), hatch);
      hatch.color = CameraChrome.foreground.withValues(
        alpha: 0.8 * decay * alpha,
      );
      canvas.drawLine(Offset(x, top), Offset(x, bottom), hatch);
    }

    canvas.drawLine(
      Offset(headX, top),
      Offset(headX, bottom),
      Paint()
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round
        ..color = CameraChrome.keyline.withValues(alpha: 0.3 * alpha),
    );
    canvas.drawLine(
      Offset(headX, top),
      Offset(headX, bottom),
      Paint()
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..color = CameraChrome.foreground.withValues(alpha: alpha),
    );
    canvas.restore();
  }

  void _paintCorners(Canvas canvas, Rect rect, double locked) {
    final keyline = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = CameraChrome.keyline;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = Color.lerp(CameraChrome.foreground, Signal.yellow, locked)!;
    for (final paint in [keyline, stroke]) {
      _corner(canvas, paint, rect.topLeft, 1, 1);
      _corner(canvas, paint, rect.topRight, -1, 1);
      _corner(canvas, paint, rect.bottomLeft, 1, -1);
      _corner(canvas, paint, rect.bottomRight, -1, -1);
    }
  }

  void _corner(Canvas canvas, Paint paint, Offset at, double sx, double sy) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.scale(sx, sy);
    canvas.drawPath(
      Path()
        ..moveTo(0, _arm)
        ..lineTo(0, _radius)
        ..arcToPoint(
          const Offset(_radius, 0),
          radius: const Radius.circular(_radius),
        )
        ..lineTo(_arm, 0),
      paint,
    );
    canvas.restore();
  }

  void _paintBadge(Canvas canvas, Offset c, double locked) {
    final r = 28.0 * lerpDouble(0.8, 1, locked)!;
    canvas.drawCircle(
      c,
      r,
      Paint()..color = Signal.yellow.withValues(alpha: locked),
    );
    final check = Path()
      ..moveTo(c.dx - 12, c.dy + 1)
      ..lineTo(c.dx - 3, c.dy + 10)
      ..lineTo(c.dx + 13, c.dy - 9);
    final progress = ((lock.value - 0.3) / 0.7).clamp(0.0, 1.0);
    for (final m in check.computeMetrics()) {
      canvas.drawPath(
        m.extractPath(0, m.length * progress),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..color = Signal.onYellow,
      );
    }
  }

  @override
  bool shouldRepaint(_FramePainter old) => false;
}

/// Dims everything outside the frame, so the note area reads as the target
/// and text placed on the picture stays legible.
class ScrimPainter extends CustomPainter {
  const ScrimPainter(this.hole);

  final Rect hole;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawPath(
      Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(Offset.zero & size)
        ..addRRect(
          RRect.fromRectAndRadius(hole, const Radius.circular(Radii.x2l)),
        ),
      Paint()..color = CameraChrome.scrim,
    );
  }

  @override
  bool shouldRepaint(ScrimPainter old) => old.hole != hole;
}

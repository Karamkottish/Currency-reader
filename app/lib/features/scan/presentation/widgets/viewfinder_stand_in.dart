import 'package:flutter/material.dart';

/// Stand-in for the live camera, so the overlay can be judged against
/// something photo-like: a tabletop and an abstract note shape (deliberately
/// not a reproduction of any real banknote).
///
/// Stage 1 deletes this file and uses the real camera preview instead. Its
/// colours are local because they imitate a photo; they are not UI colours.
class ViewfinderStandIn extends StatelessWidget {
  const ViewfinderStandIn({super.key, required this.frame});

  final Rect frame;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(painter: _StandInPainter(frame)),
    );
  }
}

class _StandInPainter extends CustomPainter {
  const _StandInPainter(this.frame);

  final Rect frame;

  @override
  void paint(Canvas canvas, Size size) {
    final all = Offset.zero & size;
    canvas.drawRect(
      all,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF55524D), Color(0xFF3A3835)],
        ).createShader(all),
    );

    canvas.save();
    canvas.translate(frame.center.dx, frame.center.dy);
    canvas.rotate(-0.035);
    final w = frame.width - 28;
    final h = frame.height - 28;
    final note = Rect.fromCenter(center: Offset.zero, width: w, height: h);
    canvas.drawRRect(
      RRect.fromRectAndRadius(note, const Radius.circular(6)),
      Paint()..color = const Color(0xFF9FB2C8),
    );

    final ink = Paint()..color = const Color(0xFF6F879F);
    canvas.drawCircle(Offset(w * 0.2, 0), h * 0.28, ink);
    canvas.drawRect(
      Rect.fromLTWH(-w * 0.42, -h * 0.32, w * 0.3, h * 0.11),
      ink,
    );
    canvas.drawRect(
      Rect.fromLTWH(-w * 0.42, h * 0.14, w * 0.2, h * 0.07),
      ink,
    );
    canvas.drawRect(
      Rect.fromLTWH(-w * 0.42, h * 0.26, w * 0.26, h * 0.07),
      ink,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_StandInPainter old) => old.frame != frame;
}

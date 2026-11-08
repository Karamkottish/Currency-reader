import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/tokens.dart';

/// Icon over a caption, used on either side of the shutter.
class DockAction extends StatelessWidget {
  const DockAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: theme.colorScheme.onSurface,
        minimumSize: const Size(72, 64),
        padding: const EdgeInsets.symmetric(
          horizontal: Space.s3,
          vertical: Space.s2,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.xl),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: IconSize.md),
          const SizedBox(height: Space.s1),
          Text(
            label,
            maxLines: 1,
            softWrap: false,
            style: theme.textTheme.labelMedium,
          ),
        ],
      ),
    );
  }
}

/// A classic camera shutter in the theme's foreground colour.
class Shutter extends StatefulWidget {
  const Shutter({super.key, required this.enabled, required this.onPressed});

  static const _size = 76.0;

  final bool enabled;
  final VoidCallback onPressed;

  @override
  State<Shutter> createState() => _ShutterState();
}

class _ShutterState extends State<Shutter> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: 'Scan note',
      excludeSemantics: true,
      onTap: widget.enabled ? widget.onPressed : null,
      child: AnimatedOpacity(
        opacity: widget.enabled ? 1 : 0.38,
        duration: Motion.base,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const CircleBorder(),
            onHighlightChanged: (v) => setState(() => _down = v),
            onTap: widget.enabled
                ? () {
                    HapticFeedback.selectionClick();
                    widget.onPressed();
                  }
                : null,
            child: SizedBox.square(
              dimension: Shutter._size,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: color, width: 3),
                    ),
                    child: const SizedBox.square(dimension: Shutter._size),
                  ),
                  AnimatedScale(
                    scale: _down ? 0.88 : 1,
                    duration: Motion.fast,
                    curve: Motion.easeOut,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: color,
                      ),
                      child: const SizedBox.square(dimension: 60),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

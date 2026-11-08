import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../app/theme/tokens.dart';

/// Shows the result of a scan as a draggable sheet.
Future<void> showScanResultSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: 640),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.82,
      minChildSize: 0.5,
      maxChildSize: 1,
      snap: true,
      builder: (_, controller) => ResultSheet(controller: controller),
    ),
  );
}

/// Sample content until the currency stages connect real data. Every value
/// here is true of the Europa series 20 euro note, and the sheet is tagged
/// "Sample data" so it cannot be mistaken for a real scan.
abstract class _Sample {
  static const amount = '€20';
  static const name = 'Euro banknote';
  static const series = 'Europa series';
  static const noteColor = Color(0xFF3D6FB4);
  static const source = 'ecb.europa.eu';
  static const facts = [
    'It was the first euro note with a portrait window, which turns '
        'see-through when held up to the light.',
    'The windows and gateways on the front stand for openness. The bridge '
        'on the back stands for communication.',
  ];
}

enum _Phase { gathering, checking, upToDate }

/// Shows the planned flow: the facts appear, a quiet line reports the
/// background check for newer sources, and the actions stay within reach.
class ResultSheet extends StatefulWidget {
  const ResultSheet({super.key, required this.controller});

  final ScrollController controller;

  @override
  State<ResultSheet> createState() => _ResultSheetState();
}

class _ResultSheetState extends State<ResultSheet> {
  _Phase _phase = _Phase.gathering;
  final _timers = <Timer>[];

  @override
  void initState() {
    super.initState();
    _timers.add(
      Timer(const Duration(milliseconds: 1200), () {
        if (mounted) setState(() => _phase = _Phase.checking);
        _timers.add(
          Timer(const Duration(milliseconds: 1600), () {
            if (mounted) setState(() => _phase = _Phase.upToDate);
          }),
        );
      }),
    );
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final gathering = _phase == _Phase.gathering;
    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: widget.controller,
            padding: const EdgeInsets.fromLTRB(
              Space.s5,
              0,
              Space.s5,
              Space.s6,
            ),
            children: [
              const _Header(),
              const SizedBox(height: Space.s4),
              _StatusLine(phase: _phase),
              const SizedBox(height: Space.s4),
              const Divider(),
              const SizedBox(height: Space.s2),
              const _DetailRow(label: 'Issuer', value: 'European Central Bank'),
              const _DetailRow(label: 'Size', value: '133 × 72 mm', numeric: true),
              const _DetailRow(
                label: 'Main colour',
                value: 'Blue',
                swatch: _Sample.noteColor,
              ),
              const _DetailRow(label: 'Design', value: 'Gothic architecture'),
              const _DetailRow(label: 'Issued since', value: 'November 2015'),
              const _DetailRow(label: 'Serial', value: 'Not read yet', muted: true),
              const SizedBox(height: Space.s2),
              const Divider(),
              const SizedBox(height: Space.s5),
              const _SectionTitle('About this note'),
              const SizedBox(height: Space.s3),
              AnimatedSwitcher(
                duration: Motion.base,
                child: gathering
                    ? const _FactSkeletons(key: ValueKey('loading'))
                    : const _Facts(key: ValueKey('facts')),
              ),
              const SizedBox(height: Space.s4),
              const Divider(),
              const SizedBox(height: Space.s5),
              const _SectionTitle('Exchange rate'),
              const SizedBox(height: Space.s3),
              const _RateRow(),
            ],
          ),
        ),
        const Divider(),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(Space.s4),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Scan another'),
                  ),
                ),
                const SizedBox(width: Space.s3),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      final router = GoRouter.of(context);
                      Navigator.of(context).pop();
                      router.push(Routes.chat);
                    },
                    child: const Text('Ask about it'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _Sample.amount,
          style: theme.textTheme.displayLarge?.copyWith(
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: Space.s2),
        Text(_Sample.name, style: theme.textTheme.titleLarge),
        Text(
          _Sample.series,
          style: theme.textTheme.bodyMedium?.copyWith(color: muted),
        ),
        const SizedBox(height: Space.s3),
        const Wrap(
          spacing: Space.s2,
          runSpacing: Space.s2,
          children: [
            _Tag(icon: Icons.check, label: 'High confidence'),
            _Tag(label: 'Sample data'),
          ],
        ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outline),
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Space.s2,
          vertical: Space.s1,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: IconSize.sm, color: theme.colorScheme.onSurface),
              const SizedBox(width: Space.s1),
            ],
            Flexible(child: Text(label, style: theme.textTheme.labelMedium)),
          ],
        ),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.phase});

  final _Phase phase;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    const spinner = SizedBox.square(
      dimension: IconSize.sm,
      child: CircularProgressIndicator(strokeWidth: 2),
    );
    final (Widget lead, String text) = switch (phase) {
      _Phase.gathering => (spinner, 'Gathering facts…'),
      _Phase.checking => (spinner, 'Saved answer. Checking for updates…'),
      _Phase.upToDate => (
          Icon(Icons.check_circle_outline, size: IconSize.sm, color: muted),
          'Up to date',
        ),
    };
    return Semantics(
      liveRegion: true,
      child: AnimatedSwitcher(
        duration: Motion.base,
        child: Row(
          key: ValueKey(phase),
          children: [
            ExcludeSemantics(child: lead),
            const SizedBox(width: Space.s2),
            Expanded(
              child: Text(
                text,
                style: theme.textTheme.bodyMedium?.copyWith(color: muted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.swatch,
    this.numeric = false,
    this.muted = false,
  });

  final String label;
  final String value;
  final Color? swatch;
  final bool numeric;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.s2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: Text(
                label,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(width: Space.s4),
            Expanded(
              flex: 3,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (swatch != null) ...[
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: swatch,
                        shape: BoxShape.circle,
                      ),
                      child: const SizedBox.square(dimension: 12),
                    ),
                    const SizedBox(width: Space.s2),
                  ],
                  Flexible(
                    child: Text(
                      value,
                      textAlign: TextAlign.end,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: muted ? FontWeight.w400 : FontWeight.w500,
                        color: muted
                            ? scheme.onSurfaceVariant
                            : scheme.onSurface,
                        fontFeatures: numeric
                            ? const [FontFeature.tabularFigures()]
                            : null,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
        header: true,
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _Facts extends StatelessWidget {
  const _Facts({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final fact in _Sample.facts)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.s4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fact, style: theme.textTheme.bodyLarge),
                const SizedBox(height: Space.s1),
                Row(
                  children: [
                    Icon(Icons.link, size: IconSize.sm, color: muted),
                    const SizedBox(width: Space.s1),
                    Expanded(
                      child: Text(
                        'Source: ${_Sample.source}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _FactSkeletons extends StatelessWidget {
  const _FactSkeletons({super.key});

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHigh;
    Widget bar(double widthFactor, double height) => FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: widthFactor,
          child: Container(
            height: height,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(Radii.lg),
            ),
          ),
        );
    Widget block() => Padding(
          padding: const EdgeInsets.only(bottom: Space.s4),
          child: Column(
            children: [
              bar(1, 16),
              const SizedBox(height: Space.s2),
              bar(0.85, 16),
              const SizedBox(height: Space.s2),
              bar(0.4, 12),
            ],
          ),
        );
    return ExcludeSemantics(
      child: _Pulse(child: Column(children: [block(), block()])),
    );
  }
}

class _RateRow extends StatelessWidget {
  const _RateRow();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text('1 EUR', style: theme.textTheme.bodyLarge)),
            Text(
              '— USD',
              style: theme.textTheme.titleLarge?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
        const SizedBox(height: Space.s1),
        Text(
          'Live rates arrive in a later update.',
          style: theme.textTheme.bodySmall?.copyWith(color: muted),
        ),
      ],
    );
  }
}

/// Gentle fade for loading placeholders. Static under reduce-motion.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});

  final Widget child;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
    value: 1,
  );
  late final Animation<double> _opacity = Tween<double>(
    begin: 0.5,
    end: 1,
  ).animate(_c);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c
        ..stop()
        ..value = 1;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      FadeTransition(opacity: _opacity, child: widget.child);
}

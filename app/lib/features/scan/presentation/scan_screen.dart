import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../app/theme/tokens.dart';
import 'scan_controller.dart';
import 'scan_state.dart';
import 'widgets/result_sheet.dart';
import 'widgets/scan_controls.dart';
import 'widgets/scan_frame.dart';
import 'widgets/viewfinder_stand_in.dart';

/// Home screen. The app opens straight on the camera.
///
/// The picture stays dark in both themes, as in any camera app. The dock
/// below it follows the phone's light or dark setting.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen> {
  bool _flashOn = false; // UI only until the camera is connected

  Future<void> _onState(ScanState? prev, ScanState next) async {
    if (next is ScanLocked && prev is! ScanLocked) {
      HapticFeedback.mediumImpact();
    }
    if (next is! ScanConfirmed) return;
    await showScanResultSheet(context);
    if (!mounted) return;
    ref.read(scanControllerProvider.notifier).start();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ScanState>(scanControllerProvider, _onState);
    final state = ref.watch(scanControllerProvider);
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final busy = state is ScanLocked ||
        state is ScanConfirmed ||
        (state is ScanSearching && state.capturing);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: scheme.surface,
        systemNavigationBarIconBrightness:
            isDark ? Brightness.light : Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: scheme.surface,
        body: LayoutBuilder(
          builder: (context, c) {
            final wide = c.maxWidth > c.maxHeight;
            const r = Radius.circular(Radii.x3l);
            return Flex(
              direction: wide ? Axis.horizontal : Axis.vertical,
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: wide
                        ? const BorderRadius.horizontal(right: r)
                        : const BorderRadius.vertical(bottom: r),
                    child: _Viewfinder(
                      state: state,
                      flashOn: _flashOn,
                      onFlash: () => setState(() => _flashOn = !_flashOn),
                    ),
                  ),
                ),
                _Dock(
                  vertical: wide,
                  shutterEnabled: !busy,
                  onShutter: () =>
                      ref.read(scanControllerProvider.notifier).runDemoScan(),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Viewfinder extends StatelessWidget {
  const _Viewfinder({
    required this.state,
    required this.flashOn,
    required this.onFlash,
  });

  final ScanState state;
  final bool flashOn;
  final VoidCallback onFlash;

  @override
  Widget build(BuildContext context) {
    final mood = switch (state) {
      ScanLocked() || ScanConfirmed() => FrameMood.locked,
      ScanFailed() => FrameMood.failed,
      _ => FrameMood.searching,
    };
    final safeTop = MediaQuery.paddingOf(context).top;
    return LayoutBuilder(
      builder: (context, c) {
        const noteRatio = 1.9;
        final byHeight = (c.maxHeight - safeTop - 156) * noteRatio;
        final w = math
            .min(math.min(c.maxWidth - Space.s12, 520.0), byHeight)
            .clamp(200.0, 520.0);
        final frame = Rect.fromCenter(
          center: Offset(
            c.maxWidth / 2,
            safeTop + (c.maxHeight - safeTop) * 0.44,
          ),
          width: w,
          height: w / noteRatio,
        );
        return Stack(
          children: [
            Positioned.fill(child: ViewfinderStandIn(frame: frame)),
            Positioned.fill(child: CustomPaint(painter: ScrimPainter(frame))),
            Positioned.fromRect(rect: frame, child: ScanFrame(mood: mood)),
            Positioned(
              top: frame.bottom + Space.s4,
              left: Space.s6,
              right: Space.s6,
              child: _Hint(state: state),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _TopBar(flashOn: flashOn, onFlash: onFlash),
            ),
          ],
        );
      },
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.flashOn, required this.onFlash});

  final bool flashOn;
  final VoidCallback onFlash;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.all(Space.s2),
        child: Row(
          children: [
            const SizedBox(width: Space.s2),
            Image.asset(
              'assets/brand/mark.png',
              width: 36,
              height: 36,
              cacheWidth: 108,
              color: CameraChrome.foreground,
              semanticLabel: 'Currency Reader',
            ),
            const Spacer(),
            IconButton(
              onPressed: onFlash,
              isSelected: flashOn,
              tooltip: flashOn ? 'Turn flash off' : 'Turn flash on',
              iconSize: IconSize.md,
              icon: const Icon(Icons.flash_off_outlined),
              selectedIcon: const Icon(Icons.flash_on_outlined),
              style: IconButton.styleFrom(
                fixedSize: const Size.square(Space.s12),
                // The icon changes too, so state is not shown by colour alone.
                backgroundColor:
                    flashOn ? CameraChrome.foreground : CameraChrome.control,
                foregroundColor:
                    flashOn ? Neutral.n950 : CameraChrome.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.state});

  final ScanState state;

  @override
  Widget build(BuildContext context) {
    final (String title, String? detail) = switch (state) {
      ScanIdle() => ('Camera paused', null),
      ScanSearching(:final hint) => (
          hint ?? 'Point at a banknote',
          hint == null ? 'Keep it flat and inside the frame' : null,
        ),
      ScanLocked() || ScanConfirmed() => ('Got it', null),
      ScanFailed(:final failure) => (failure.message, null),
    };
    final text = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      child: AnimatedSwitcher(
        duration: Motion.base,
        switchInCurve: Motion.easeOut,
        child: Column(
          key: ValueKey(title),
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              textAlign: TextAlign.center,
              style: text.titleMedium?.copyWith(
                color: CameraChrome.foreground,
              ),
            ),
            if (detail != null) ...[
              const SizedBox(height: Space.s1),
              Text(
                detail,
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(
                  color: CameraChrome.foreground,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Dock extends StatelessWidget {
  const _Dock({
    required this.vertical,
    required this.shutterEnabled,
    required this.onShutter,
  });

  final bool vertical;
  final bool shutterEnabled;
  final VoidCallback onShutter;

  @override
  Widget build(BuildContext context) {
    final controls = Flex(
      direction: vertical ? Axis.vertical : Axis.horizontal,
      children: [
        Expanded(
          child: Center(
            child: DockAction(
              icon: Icons.bookmark_border,
              label: 'Saved',
              onPressed: () => context.push(Routes.currencies),
            ),
          ),
        ),
        Shutter(enabled: shutterEnabled, onPressed: onShutter),
        Expanded(
          child: Center(
            child: DockAction(
              icon: Icons.chat_bubble_outline,
              label: 'Ask',
              onPressed: () => context.push(Routes.chat),
            ),
          ),
        ),
      ],
    );
    return SafeArea(
      top: vertical,
      left: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Space.s4,
          vertical: Space.s4,
        ),
        child: vertical ? SizedBox(width: 104, child: controls) : controls,
      ),
    );
  }
}

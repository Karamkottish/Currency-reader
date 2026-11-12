import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../app/theme/tokens.dart';
import '../../../core/errors/failure.dart';
import '../data/device_camera_source.dart' show showOcrText;
import 'scan_controller.dart';
import 'scan_state.dart';
import 'widgets/result_sheet.dart';
import 'widgets/scan_controls.dart';
import 'widgets/scan_frame.dart';

/// Home screen. The app opens straight on the camera.
///
/// The picture stays dark in both themes, as in any camera app. The dock
/// below it follows the phone's light or dark setting.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen>
    with WidgetsBindingObserver {
  bool _flashOn = false;
  bool _switching = false;

  ScanController get _scan => ref.read(scanControllerProvider.notifier);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // After the first frame, so the screen shows "Starting camera…" at once.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _scan.openCamera();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// The camera must not keep running while the app is not visible.
  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    if (lifecycle == AppLifecycleState.paused) _scan.pause();
    if (lifecycle == AppLifecycleState.resumed) _scan.resume();
  }

  Future<void> _onState(ScanState? prev, ScanState next) async {
    if (next is ScanLocked && prev is! ScanLocked) {
      HapticFeedback.mediumImpact();
    }
    if (next is! ScanConfirmed) return;
    await showScanResultSheet(context);
    if (!mounted) return;
    _scan.start();
  }

  /// Opens another screen and stops reading frames until it is closed.
  Future<void> _goTo(String route) async {
    await _scan.pause();
    if (!mounted) return;
    await context.push(route);
    if (mounted) await _scan.resume();
  }

  Future<void> _toggleFlash() async {
    final next = !_flashOn;
    final ok = await ref.read(cameraSourceProvider).setFlash(next);
    if (!mounted) return;
    if (ok) {
      setState(() => _flashOn = next);
    } else {
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          const SnackBar(content: Text("This phone's camera has no flash.")),
        );
    }
  }

  Future<void> _switchCamera() async {
    if (_switching) return;
    setState(() => _switching = true);
    final ok = await ref.read(cameraSourceProvider).switchCamera();
    if (!mounted) return;
    setState(() {
      _switching = false;
      if (ok) _flashOn = false; // the other camera starts with the torch off
    });
    if (!ok) {
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          const SnackBar(content: Text("Couldn't switch cameras.")),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ScanState>(scanControllerProvider, _onState);
    final state = ref.watch(scanControllerProvider);
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final failed = state is ScanFailed;
    final busy = failed ||
        state is ScanIdle ||
        state is ScanLocked ||
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
                      onFlash: failed ? null : _toggleFlash,
                      onSwitch: failed || _switching ? null : _switchCamera,
                      onRetry: _scan.openCamera,
                    ),
                  ),
                ),
                _Dock(
                  vertical: wide,
                  shutterEnabled: !busy,
                  onShutter: _scan.runDemoScan,
                  onOpen: _goTo,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Viewfinder extends ConsumerWidget {
  const _Viewfinder({
    required this.state,
    required this.flashOn,
    required this.onFlash,
    required this.onSwitch,
    required this.onRetry,
  });

  final ScanState state;
  final bool flashOn;
  final VoidCallback? onFlash;
  final VoidCallback? onSwitch;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final camera = ref.watch(cameraSourceProvider);
    final failure = state is ScanFailed ? (state as ScanFailed).failure : null;
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
            // Rebuilds after switching cameras, when the picture changes but
            // the scan state does not.
            Positioned.fill(
              child: ListenableBuilder(
                listenable: camera.changes,
                builder: (_, __) => camera.buildPreview(frame),
              ),
            ),
            Positioned.fill(child: CustomPaint(painter: ScrimPainter(frame))),
            if (failure == null) ...[
              Positioned.fromRect(rect: frame, child: ScanFrame(mood: mood)),
              Positioned(
                top: frame.bottom + Space.s4,
                left: Space.s6,
                right: Space.s6,
                child: _Hint(state: state),
              ),
            ] else
              Positioned.fill(
                child: _CameraProblem(failure: failure, onRetry: onRetry),
              ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _TopBar(
                flashOn: flashOn,
                onFlash: onFlash,
                onSwitch: camera.canSwitchCamera ? onSwitch : null,
                showSwitch: camera.canSwitchCamera,
              ),
            ),
            if (showOcrText && failure == null)
              const Positioned(
                left: Space.s4,
                right: Space.s4,
                bottom: Space.s4,
                child: _DebugReadout(),
              ),
          ],
        );
      },
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.flashOn,
    required this.onFlash,
    required this.onSwitch,
    required this.showSwitch,
  });

  final bool flashOn;
  final VoidCallback? onFlash;
  final VoidCallback? onSwitch;
  final bool showSwitch;

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
            if (showSwitch) ...[
              IconButton(
                onPressed: onSwitch,
                tooltip: 'Switch camera',
                iconSize: IconSize.md,
                icon: const Icon(Icons.flip_camera_android_outlined),
                style: IconButton.styleFrom(
                  fixedSize: const Size.square(Space.s12),
                  backgroundColor: CameraChrome.control,
                  foregroundColor: CameraChrome.foreground,
                  disabledBackgroundColor: CameraChrome.control,
                  disabledForegroundColor: Neutral.n500,
                ),
              ),
              const SizedBox(width: Space.s2),
            ],
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
                disabledBackgroundColor: CameraChrome.control,
                disabledForegroundColor: Neutral.n500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hint extends StatefulWidget {
  const _Hint({required this.state});

  final ScanState state;

  @override
  State<_Hint> createState() => _HintState();
}

class _HintState extends State<_Hint> {
  /// Changes every time the wording changes. The fade needs a key that is
  /// never reused: keying by the text itself breaks when the same text comes
  /// back while the previous copy is still fading out (open another screen
  /// and return within 200 ms).
  int _generation = 0;
  late (String, String?) _copy = _copyFor(widget.state);

  static (String, String?) _copyFor(ScanState state) => switch (state) {
        ScanIdle() => ('Starting camera…', null),
        ScanSearching(:final hint) => (
            hint ?? 'Point at a banknote',
            hint == null ? 'Keep it flat and inside the frame' : null,
          ),
        ScanLocked() || ScanConfirmed() => ('Got it', null),
        ScanFailed(:final failure) => (failure.message, null),
      };

  @override
  void didUpdateWidget(_Hint oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = _copyFor(widget.state);
    if (next != _copy) {
      _copy = next;
      _generation++;
    }
  }

  @override
  Widget build(BuildContext context) {
    final (title, detail) = _copy;
    final text = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      child: AnimatedSwitcher(
        duration: Motion.base,
        switchInCurve: Motion.easeOut,
        child: Column(
          key: ValueKey(_generation),
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

/// Shown instead of the frame when the camera cannot be used. It says what
/// happened, what to do, and offers the one action that can help.
class _CameraProblem extends StatelessWidget {
  const _CameraProblem({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final denied = failure is CameraDenied;
    return ColoredBox(
      color: CameraChrome.scrim,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Space.s6),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Semantics(
              liveRegion: true,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ExcludeSemantics(
                    child: Icon(
                      Icons.videocam_off_outlined,
                      size: 48,
                      color: CameraChrome.foreground,
                    ),
                  ),
                  const SizedBox(height: Space.s4),
                  Text(
                    denied ? 'Camera is off' : 'Camera unavailable',
                    textAlign: TextAlign.center,
                    style: text.titleLarge?.copyWith(
                      color: CameraChrome.foreground,
                    ),
                  ),
                  const SizedBox(height: Space.s2),
                  Text(
                    failure.message,
                    textAlign: TextAlign.center,
                    style: text.bodyLarge?.copyWith(
                      color: CameraChrome.foreground,
                    ),
                  ),
                  const SizedBox(height: Space.s6),
                  FilledButton(
                    onPressed: onRetry,
                    child: const Text('Try again'),
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

/// Debug builds only: what OCR just read and how long it took. This is the
/// number that goes in the device log. Release builds never show it.
class _DebugReadout extends ConsumerWidget {
  const _DebugReadout();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reading = ref.watch(ocrReadingProvider).asData?.value;
    if (reading == null) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    return ExcludeSemantics(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: CameraChrome.control,
          borderRadius: BorderRadius.circular(Radii.xl),
        ),
        child: Padding(
          padding: const EdgeInsets.all(Space.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'OCR ${reading.elapsed.inMilliseconds} ms · '
                '${reading.lines.length} lines',
                style: text.labelMedium?.copyWith(
                  color: CameraChrome.foreground,
                ),
              ),
              if (reading.lines.isNotEmpty)
                Text(
                  reading.lines.take(4).join('\n'),
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall?.copyWith(
                    color: CameraChrome.foreground,
                    fontFamily: 'monospace',
                  ),
                ),
            ],
          ),
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
    required this.onOpen,
  });

  final bool vertical;
  final bool shutterEnabled;
  final VoidCallback onShutter;
  final ValueChanged<String> onOpen;

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
              onPressed: () => onOpen(Routes.currencies),
            ),
          ),
        ),
        Shutter(enabled: shutterEnabled, onPressed: onShutter),
        Expanded(
          child: Center(
            child: DockAction(
              icon: Icons.chat_bubble_outline,
              label: 'Ask',
              onPressed: () => onOpen(Routes.chat),
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

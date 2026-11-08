import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'scan_state.dart';

/// UI stage: the camera and recognition are not connected yet, so
/// [runDemoScan] walks through the same states the real pipeline will
/// produce (searching -> locked -> confirmed). Stage 1 replaces it.
class ScanController extends Notifier<ScanState> {
  Timer? _timer;

  @override
  ScanState build() {
    ref.onDispose(() => _timer?.cancel());
    return const ScanSearching();
  }

  void start() {
    _timer?.cancel();
    state = const ScanSearching();
  }

  void runDemoScan() {
    _timer?.cancel();
    state = const ScanSearching(hint: 'Hold steady…', capturing: true);
    _timer = Timer(const Duration(milliseconds: 1800), () {
      state = const ScanLocked(currencyId: 'demo', confidence: 0.93);
      _timer = Timer(const Duration(milliseconds: 1000), () {
        state = const ScanConfirmed(currencyId: 'demo');
      });
    });
  }
}

final scanControllerProvider =
    NotifierProvider<ScanController, ScanState>(ScanController.new);

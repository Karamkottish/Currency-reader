import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'scan_state.dart';

/// Stage 1 fills this in: camera frames -> vision worker -> state.
class ScanController extends Notifier<ScanState> {
  @override
  ScanState build() => const ScanIdle();

  void start() => state = const ScanSearching(hint: 'Line the note up');

  void stop() => state = const ScanIdle();
}

final scanControllerProvider =
    NotifierProvider<ScanController, ScanState>(ScanController.new);

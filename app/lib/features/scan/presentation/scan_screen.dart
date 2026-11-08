import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'scan_controller.dart';
import 'scan_state.dart';

class ScanScreen extends ConsumerWidget {
  const ScanScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(scanControllerProvider);
    final label = switch (state) {
      ScanIdle() => 'Camera not started (Stage 1)',
      ScanSearching(:final hint) => hint ?? 'Searching...',
      ScanLocked(:final currencyId) => 'Found $currencyId',
      ScanConfirmed(:final currencyId) => 'Confirmed $currencyId',
      ScanFailed(:final failure) => failure.message,
    };
    return Scaffold(
      appBar: AppBar(title: const Text('Scan')),
      body: Center(child: Text(label)),
    );
  }
}

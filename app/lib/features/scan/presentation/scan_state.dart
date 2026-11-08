import '../../../core/errors/failure.dart';

sealed class ScanState {
  const ScanState();
}

class ScanIdle extends ScanState {
  const ScanIdle();
}

class ScanSearching extends ScanState {
  const ScanSearching({this.hint, this.capturing = false});
  final String? hint;

  /// A scan is in progress, so the shutter is unavailable.
  final bool capturing;
}

class ScanLocked extends ScanState {
  const ScanLocked({required this.currencyId, required this.confidence});
  final String currencyId;
  final double confidence;
}

class ScanConfirmed extends ScanState {
  const ScanConfirmed({required this.currencyId, this.serial});
  final String currencyId;
  final String? serial;
}

class ScanFailed extends ScanState {
  const ScanFailed(this.failure);
  final Failure failure;
}

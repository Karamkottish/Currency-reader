/// Decides which camera frames get OCR.
///
/// "Latest only" backpressure: while one frame is being read, every frame that
/// arrives is dropped instead of queued, and only every [every]th frame is
/// even considered. Without this, OCR falls behind the camera and the app
/// shows stale results while the phone heats up.
class FrameGate {
  FrameGate({this.every = 3}) : assert(every >= 1);

  final int every;
  int _count = 0;
  bool _busy = false;

  /// True if this frame should be processed. Call [release] when done.
  bool tryAcquire() {
    _count++;
    if (_busy || _count % every != 0) return false;
    _busy = true;
    return true;
  }

  void release() => _busy = false;
}

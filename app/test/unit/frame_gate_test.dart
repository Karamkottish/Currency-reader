import 'package:currency_reader/features/scan/data/frame_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only every third frame is processed', () {
    final gate = FrameGate(every: 3);
    final taken = <int>[];
    for (var frame = 1; frame <= 9; frame++) {
      if (gate.tryAcquire()) {
        taken.add(frame);
        gate.release();
      }
    }
    expect(taken, [3, 6, 9]);
  });

  test('frames that arrive while one is being read are dropped', () {
    final gate = FrameGate(every: 1);
    expect(gate.tryAcquire(), isTrue);
    expect(gate.tryAcquire(), isFalse, reason: 'previous frame still busy');
    expect(gate.tryAcquire(), isFalse);
    gate.release();
    expect(gate.tryAcquire(), isTrue);
  });

  test('a busy frame on the Nth turn is skipped, not queued', () {
    final gate = FrameGate(every: 2);
    expect(gate.tryAcquire(), isFalse); // frame 1
    expect(gate.tryAcquire(), isTrue); // frame 2, now busy
    expect(gate.tryAcquire(), isFalse); // frame 3
    expect(gate.tryAcquire(), isFalse); // frame 4: due, but busy
    gate.release();
    expect(gate.tryAcquire(), isFalse); // frame 5
    expect(gate.tryAcquire(), isTrue); // frame 6
  });
}

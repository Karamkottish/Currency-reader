import 'package:currency_reader/features/knowledge/domain/retriever.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('RRF ranks items found by both lists first', () {
    final merged = reciprocalRankFusion([
      [1, 2, 3],
      [3, 1, 4],
    ]);
    expect(merged.first, 1);
    expect(merged.toSet(), {1, 2, 3, 4});
  });
}

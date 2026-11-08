import 'package:currency_reader/features/scan/domain/vote_aggregator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('confirms only after 3 of last 5 agree', () {
    final v = VoteAggregator();
    expect(v.add('EUR_20'), isNull);
    expect(v.add('EUR_50'), isNull);
    expect(v.add('EUR_20'), isNull);
    expect(v.add('EUR_20'), 'EUR_20');
  });

  test('old readings fall out of the window', () {
    final v = VoteAggregator(windowSize: 3, required: 2);
    v.add('A');
    v.add('B');
    v.add('C');
    expect(v.add('A'), isNull);
  });
}

import 'package:currency_reader/features/scan/domain/serial_validator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const v = SerialValidator('LLDDDDDDDD');

  test('fixes look-alikes by position', () {
    expect(v.validate('AB1234567O'), 'AB12345670');
    expect(v.validate('A81234567O'), 'AB12345670');
  });

  test('rejects wrong length or impossible characters', () {
    expect(v.validate('AB123'), isNull);
    expect(v.validate('AB12345?78'), isNull);
  });
}

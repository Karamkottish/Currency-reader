import 'package:currency_reader/app/app.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('home screen shows the three entry points', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CurrencyApp()));
    await tester.pumpAndSettle();
    expect(find.text('Scan a note'), findsOneWidget);
    expect(find.text('Currencies'), findsOneWidget);
    expect(find.text('Ask a question'), findsOneWidget);
  });
}

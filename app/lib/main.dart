import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await bootstrap(); // init DB, prefs, tier detection, warm-up (later stages)
  runApp(const ProviderScope(child: CurrencyApp()));
}

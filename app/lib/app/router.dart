import 'package:go_router/go_router.dart';

import '../features/chat/presentation/chat_screen.dart';
import '../features/knowledge/presentation/currency_list_screen.dart';
import '../features/scan/presentation/scan_screen.dart';

abstract class Routes {
  /// The app opens straight on the camera.
  static const scan = '/';
  static const currencies = '/currencies';
  static const chat = '/chat';
}

final appRouter = GoRouter(
  routes: [
    GoRoute(path: Routes.scan, builder: (_, __) => const ScanScreen()),
    GoRoute(
      path: Routes.currencies,
      builder: (_, __) => const CurrencyListScreen(),
    ),
    GoRoute(path: Routes.chat, builder: (_, __) => const ChatScreen()),
  ],
);

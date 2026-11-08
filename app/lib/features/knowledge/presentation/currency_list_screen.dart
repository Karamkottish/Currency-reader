import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../app/theme/tokens.dart';

/// Currencies the user has scanned. Empty until the database is connected.
class CurrencyListScreen extends StatelessWidget {
  const CurrencyListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Saved')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.s6),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ExcludeSemantics(
                    child: Image.asset(
                      'assets/brand/mark.png',
                      width: 72,
                      height: 72,
                      cacheWidth: 216,
                      color: muted,
                    ),
                  ),
                  const SizedBox(height: Space.s5),
                  Text(
                    'Nothing saved yet',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: Space.s2),
                  Text(
                    'Notes you scan are kept here, so they open instantly '
                    'next time.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyLarge?.copyWith(color: muted),
                  ),
                  const SizedBox(height: Space.s6),
                  FilledButton(
                    // Go back to the camera that opened this screen, so it can
                    // restart. Only a direct link has nothing to go back to.
                    onPressed: () => context.canPop()
                        ? context.pop()
                        : context.go(Routes.scan),
                    child: const Text('Scan a note'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

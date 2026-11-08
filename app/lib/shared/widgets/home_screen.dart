import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Currency Reader')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: const Text('Scan a note'),
            onTap: () => context.go(Routes.scan),
          ),
          ListTile(
            leading: const Icon(Icons.list),
            title: const Text('Currencies'),
            onTap: () => context.go(Routes.currencies),
          ),
          ListTile(
            leading: const Icon(Icons.chat),
            title: const Text('Ask a question'),
            onTap: () => context.go(Routes.chat),
          ),
        ],
      ),
    );
  }
}

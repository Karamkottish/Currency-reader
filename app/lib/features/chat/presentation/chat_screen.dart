import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/tokens.dart';
import 'chat_controller.dart';
import 'chat_state.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  late final ChatController _chat = ref.read(chatControllerProvider.notifier);

  @override
  void initState() {
    super.initState();
    _chat; // resolved now, so dispose() does not need ref
  }

  @override
  void dispose() {
    // Stop generation when the user leaves the screen.
    _chat.cancel();
    _input.dispose();
    super.dispose();
  }

  void _send(String text) {
    final question = text.trim();
    if (question.isEmpty || ref.read(chatControllerProvider).streaming) return;
    _input.clear();
    _chat.ask(question);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatControllerProvider);
    final messages = state.messages;
    return Scaffold(
      appBar: AppBar(title: const Text('Ask')),
      body: Column(
        children: [
          Expanded(
            child: messages.isEmpty
                ? _Suggestions(onPick: _send)
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(Space.s4),
                    itemCount: messages.length,
                    itemBuilder: (_, i) => _Message(
                      message: messages[messages.length - 1 - i],
                    ),
                  ),
          ),
          _Composer(
            controller: _input,
            streaming: state.streaming,
            onSend: () => _send(_input.text),
            onSubmitted: _send,
            onStop: _chat.cancel,
          ),
        ],
      ),
    );
  }
}

class _Suggestions extends StatelessWidget {
  const _Suggestions({required this.onPick});

  static const _prompts = [
    'What is this note made of?',
    'When was it first issued?',
    'What security features does it have?',
  ];

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Space.s6),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Ask about a banknote',
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: Space.s1),
              Text(
                'Answers come only from sourced facts.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: Space.s5),
              for (final prompt in _prompts) ...[
                OutlinedButton(
                  onPressed: () => onPick(prompt),
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.centerLeft,
                    side: BorderSide(color: theme.colorScheme.outlineVariant),
                    textStyle: theme.textTheme.bodyLarge,
                    padding: const EdgeInsets.symmetric(
                      horizontal: Space.s4,
                      vertical: Space.s3,
                    ),
                  ),
                  child: Text(prompt),
                ),
                const SizedBox(height: Space.s2),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = message.text;
    if (message.fromUser) {
      return Align(
        alignment: AlignmentDirectional.centerEnd,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 320),
          margin: const EdgeInsets.only(bottom: Space.s4),
          padding: const EdgeInsets.symmetric(
            horizontal: Space.s4,
            vertical: Space.s3,
          ),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainer,
            borderRadius: BorderRadius.circular(Radii.x2l),
          ),
          child: Text(text, style: theme.textTheme.bodyLarge),
        ),
      );
    }
    // Answers are plain text on the page, which reads better than a bubble.
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s4),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: text.isEmpty
            ? Semantics(
                label: 'Writing an answer',
                child: const SizedBox.square(
                  dimension: IconSize.md,
                  child: Padding(
                    padding: EdgeInsets.all(Space.s1),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            : ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Text(text, style: theme.textTheme.bodyLarge),
              ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.streaming,
    required this.onSend,
    required this.onSubmitted,
    required this.onStop,
  });

  final TextEditingController controller;
  final bool streaming;
  final VoidCallback onSend;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          Space.s4,
          Space.s2,
          Space.s4,
          Space.s3,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: onSubmitted,
                decoration: const InputDecoration(
                  hintText: 'Ask about a banknote',
                ),
              ),
            ),
            const SizedBox(width: Space.s2),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (_, value, __) {
                final canSend = value.text.trim().isNotEmpty;
                return IconButton.filled(
                  onPressed: streaming ? onStop : (canSend ? onSend : null),
                  tooltip: streaming ? 'Stop' : 'Send',
                  iconSize: IconSize.md,
                  icon: Icon(streaming ? Icons.stop : Icons.arrow_upward),
                  style: IconButton.styleFrom(
                    fixedSize: const Size.square(Space.s12),
                    backgroundColor: scheme.tertiary,
                    foregroundColor: scheme.onTertiary,
                    disabledBackgroundColor: scheme.surfaceContainer,
                    disabledForegroundColor: scheme.onSurfaceVariant,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

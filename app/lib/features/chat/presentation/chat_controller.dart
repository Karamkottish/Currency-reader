import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_inference_engine.dart';
import '../domain/inference_engine.dart';
import 'chat_state.dart';

/// The one place the engine implementation is chosen. Stage 9 switches this
/// by device tier; tests override it with a fake.
final inferenceEngineProvider = Provider<InferenceEngine>((ref) {
  final engine = FakeInferenceEngine();
  ref.onDispose(engine.unload);
  return engine;
});

class ChatController extends Notifier<ChatState> {
  @override
  ChatState build() => const ChatState();

  Future<void> ask(String question) async {
    final engine = ref.read(inferenceEngineProvider);
    state = state.copyWith(
      streaming: true,
      messages: [
        ...state.messages,
        ChatMessage(text: question, fromUser: true),
        const ChatMessage(text: '', fromUser: false),
      ],
    );
    final buffer = StringBuffer();
    await for (final token in engine.generate(question)) {
      buffer.write(token);
      final msgs = [...state.messages];
      msgs[msgs.length - 1] =
          ChatMessage(text: buffer.toString(), fromUser: false);
      state = state.copyWith(messages: msgs);
    }
    state = state.copyWith(streaming: false);
  }

  void cancel() => ref.read(inferenceEngineProvider).cancel();
}

final chatControllerProvider =
    NotifierProvider<ChatController, ChatState>(ChatController.new);

import '../../../core/errors/failure.dart';

class ChatMessage {
  const ChatMessage({required this.text, required this.fromUser});
  final String text;
  final bool fromUser;
}

class ChatState {
  const ChatState({
    this.messages = const [],
    this.streaming = false,
    this.error,
  });
  final List<ChatMessage> messages;
  final bool streaming;
  final Failure? error;

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? streaming,
    Failure? error,
  }) =>
      ChatState(
        messages: messages ?? this.messages,
        streaming: streaming ?? this.streaming,
        error: error,
      );
}

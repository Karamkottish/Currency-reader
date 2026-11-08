import '../../knowledge/domain/entities/entities.dart';

class PromptBuilder {
  PromptBuilder._();

  static const refusal = "I don't have that information yet.";

  /// Grounded prompt: the model may only use the numbered FACTS.
  static String build(String question, Iterable<Fact> facts) {
    final b = StringBuffer()
      ..writeln('System: You are a currency facts assistant. '
          'Answer ONLY from FACTS.')
      ..writeln('If the answer is not in FACTS, say "$refusal"')
      ..writeln('FACTS:');
    var i = 1;
    for (final f in facts) {
      b.writeln('[${i++}] ${f.body}');
    }
    b.writeln('User: $question');
    return b.toString();
  }
}

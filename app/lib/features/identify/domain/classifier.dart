/// Which note/coin side is in the frame. Stage 4: LiteRT implementation.
/// Stage 10: embedding-matcher implementation.
abstract class Classifier {
  Future<Classification> classify(List<int> imageBytes, int width, int height);
  Future<void> dispose();
}

class Classification {
  const Classification({required this.label, required this.confidence});
  final String label; // e.g. 'EUR_20_front' or 'background'
  final double confidence;
}

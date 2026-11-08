import 'entities/entities.dart';

/// Stage 2: exact + FTS5. Stage 6: + vector search merged with RRF.
abstract class Retriever {
  Future<List<Fact>> search(String question, {int? currencyId, int limit = 5});
}

/// Reciprocal Rank Fusion: score(d) = sum 1 / (k + rank_i(d)).
/// Each inner list is one ranking of fact ids, best first.
List<int> reciprocalRankFusion(List<List<int>> rankings, {int k = 60}) {
  final scores = <int, double>{};
  for (final ranking in rankings) {
    for (var i = 0; i < ranking.length; i++) {
      scores[ranking[i]] = (scores[ranking[i]] ?? 0) + 1 / (k + i + 1);
    }
  }
  final ids = scores.keys.toList()
    ..sort((a, b) => scores[b]!.compareTo(scores[a]!));
  return ids;
}

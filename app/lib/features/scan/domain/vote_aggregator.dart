/// Accepts a value only when it appears [required] times in the last
/// [windowSize] readings (e.g. 3 of 5). Null readings reset nothing but
/// occupy a slot, so jittery frames cannot confirm a result.
class VoteAggregator {
  VoteAggregator({this.windowSize = 5, this.required = 3})
      : assert(required <= windowSize);

  final int windowSize;
  final int required;
  final List<String?> _window = [];

  /// Adds a reading; returns the winner if it has enough votes, else null.
  String? add(String? value) {
    _window.add(value);
    if (_window.length > windowSize) _window.removeAt(0);
    final counts = <String, int>{};
    for (final v in _window) {
      if (v != null) counts[v] = (counts[v] ?? 0) + 1;
    }
    for (final e in counts.entries) {
      if (e.value >= required) return e.key;
    }
    return null;
  }

  void reset() => _window.clear();
}

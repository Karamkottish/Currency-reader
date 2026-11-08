/// Validates an OCR'd serial against a per-currency pattern after fixing
/// common look-alike confusions only where the format expects a digit/letter.
/// [format] uses 'L' for a letter and 'D' for a digit, e.g. 'LLDDDDDDDD'.
class SerialValidator {
  const SerialValidator(this.format);
  final String format;

  static const _toDigit = {'O': '0', 'I': '1', 'S': '5', 'B': '8', 'Z': '2'};
  static const _toLetter = {'0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z'};

  /// Returns the normalized serial, or null if it cannot be valid.
  String? validate(String raw) {
    final s = raw.replaceAll(RegExp(r'\s'), '').toUpperCase();
    if (s.length != format.length) return null;
    final out = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (format[i] == 'D') {
        c = _toDigit[c] ?? c;
        if (!RegExp(r'[0-9]').hasMatch(c)) return null;
      } else {
        c = _toLetter[c] ?? c;
        if (!RegExp(r'[A-Z]').hasMatch(c)) return null;
      }
      out.write(c);
    }
    return out.toString();
  }
}

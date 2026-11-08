class Currency {
  const Currency({
    required this.id,
    required this.isoCode,
    required this.country,
    required this.name,
    this.symbol,
    this.issuer,
    this.active = true,
  });
  final int id;
  final String isoCode;
  final String country;
  final String name;
  final String? symbol;
  final String? issuer;
  final bool active;
}

class Denomination {
  const Denomination({
    required this.id,
    required this.currencyId,
    required this.kind, // 'note' | 'coin'
    required this.value,
    this.series,
    this.introduced,
    this.material,
    this.sizeMm,
  });
  final int id;
  final int currencyId;
  final String kind;
  final double value;
  final String? series;
  final String? introduced;
  final String? material;
  final String? sizeMm;
}

/// One short, self-contained, sourced sentence.
class Fact {
  const Fact({
    required this.id,
    required this.currencyId,
    this.denominationId,
    required this.lang,
    required this.title,
    required this.body,
    required this.source,
    required this.version,
  });
  final int id;
  final int currencyId;
  final int? denominationId;
  final String lang;
  final String title;
  final String body;
  final String source;
  final int version;
}

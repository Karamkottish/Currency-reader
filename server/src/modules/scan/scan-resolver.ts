import { CurrencyRecord, KeywordKind } from '../catalog/catalog.types';
import { ResolveScanResponse, ScanMatch, ScanStatus } from './scan.dto';

/** How much each kind of clue is worth. Sums are capped at 1. */
export const CLUE_WEIGHT: Record<KeywordKind, number> = {
  issuer: 0.5,
  currency: 0.4,
  country: 0.3,
  code: 0.25,
};

const CLUE_LABEL: Record<KeywordKind, string> = {
  issuer: 'Issuer',
  currency: 'Currency word',
  country: 'Country',
  code: 'ISO code',
};

/** A match must reach this to be reported at all. */
const MIN_CONFIDENCE = 0.25;
/** A clear match needs at least this much confidence... */
const CLEAR_CONFIDENCE = 0.5;
/** ...and this much lead over the runner-up. */
const CLEAR_MARGIN = 0.25;
const MAX_MATCHES = 3;

/**
 * Upper-cases, removes accents and punctuation, and joins what is left with
 * single spaces. "Banque Centrale Européenne" -> "BANQUE CENTRALE EUROPEENNE".
 * Thousands separators go first so "10,000" becomes "10000", not "10 000".
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/(?<=\d)[,.](?=\d{3}\b)/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const hasPhrase = (haystack: string, phrase: string) =>
  ` ${haystack} `.includes(` ${phrase} `);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextStep(status: ScanStatus, matches: ScanMatch[]): string {
  switch (status) {
    case ScanStatus.MATCHED:
      return `Show the facts with GET /v1/currencies/${matches[0].isoCode}/facts.`;
    case ScanStatus.AMBIGUOUS:
      return 'Ask the user to confirm one of the candidates, or scan again with the note flat and well lit.';
    case ScanStatus.UNKNOWN:
      return 'This currency is not in the catalogue. Ask the user to scan again; looking up new currencies is not available yet.';
  }
}

/**
 * Works out which currency an OCR reading belongs to.
 *
 * The method is deliberately plain: look for phrases printed on notes (the
 * issuing bank, the currency word, the country, the ISO code), add up how
 * much each is worth, and say so in `evidence`. No score is hidden, so a
 * wrong answer can be traced to the clue that caused it.
 */
export function resolveScan(
  currencies: CurrencyRecord[],
  lines: string[],
): ResolveScanResponse {
  const text = normalizeText(lines.join(' '));

  const scored = currencies
    .map((currency) => {
      const evidence: string[] = [];
      let confidence = 0;
      const countedKinds = new Set<KeywordKind>();

      // Longer phrases first, so "FEDERAL RESERVE NOTE" is not also counted
      // as "FEDERAL RESERVE".
      const keywords = [...currency.keywords].sort((a, b) => b.phrase.length - a.phrase.length);
      const used: string[] = [];
      for (const { phrase, kind } of keywords) {
        if (!hasPhrase(text, phrase)) continue;
        // Whole words only: "EURO" is not inside "EUROPEAN", but
        // "FEDERAL RESERVE" is inside "FEDERAL RESERVE NOTE".
        if (used.some((u) => ` ${u} `.includes(` ${phrase} `))) continue;
        used.push(phrase);
        evidence.push(`${CLUE_LABEL[kind]} "${phrase}"`);
        // One clue of each kind counts; a second issuer name adds nothing.
        if (!countedKinds.has(kind)) {
          countedKinds.add(kind);
          confidence += CLUE_WEIGHT[kind];
        }
      }
      return { currency, confidence: Math.min(1, confidence), evidence };
    })
    .filter((s) => s.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MATCHES);

  const matches: ScanMatch[] = scored.map(({ currency, confidence, evidence }) => {
    const found = currency.denominations.filter(
      (d) => hasPhrase(text, String(d.value)) || d.words.some((w) => hasPhrase(text, w)),
    );
    const match: ScanMatch = {
      isoCode: currency.isoCode,
      name: currency.name,
      confidence: round2(confidence),
      evidence,
    };
    if (found.length === 1) {
      match.denomination = { value: found[0].value, kind: found[0].kind };
      match.evidence = [...evidence, `Denomination ${found[0].value}`];
    }
    return match;
  });

  const [top, second] = matches;
  let status: ScanStatus;
  if (!top) {
    status = ScanStatus.UNKNOWN;
  } else if (
    top.confidence >= CLEAR_CONFIDENCE &&
    (!second || top.confidence - second.confidence >= CLEAR_MARGIN)
  ) {
    status = ScanStatus.MATCHED;
  } else {
    status = ScanStatus.AMBIGUOUS;
  }

  return { status, matches, nextStep: nextStep(status, matches) };
}

export type NoteKind = 'note' | 'coin';

/** How strongly a phrase on a note points to its currency. */
export type KeywordKind = 'issuer' | 'currency' | 'country' | 'code';

export interface Keyword {
  /** Matched against OCR text after upper-casing and removing punctuation. */
  phrase: string;
  kind: KeywordKind;
}

export interface DenominationRecord {
  value: number;
  kind: NoteKind;
  /** Spelled-out forms that may be printed on the note, upper case. */
  words: string[];
}

export interface FactSource {
  name: string;
  url: string;
}

export interface FactRecord {
  id: string;
  isoCode: string;
  /** Set when the fact is about one denomination only. */
  denomination?: number;
  text: string;
  source: FactSource;
  /**
   * `unverified`: written by hand from public sources and not yet checked by
   * the update pipeline. The app must show it as such.
   */
  verification: 'unverified' | 'verified';
}

export interface CurrencyRecord {
  isoCode: string;
  name: string;
  country: string;
  symbol: string;
  issuer: string;
  keywords: Keyword[];
  denominations: DenominationRecord[];
  /** Bumped whenever any fact of this currency changes. Drives ETag. */
  factsVersion: number;
}

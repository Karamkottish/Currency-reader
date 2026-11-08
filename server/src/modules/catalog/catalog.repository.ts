import { CurrencyRecord, FactRecord } from './catalog.types';

export interface ListOptions {
  /** Case-insensitive match on code, name or country. */
  q?: string;
  limit: number;
  offset: number;
}

export interface ListResult {
  items: CurrencyRecord[];
  total: number;
}

/**
 * Where currencies and facts come from. Every method is async so the
 * in-memory seed can be replaced by Postgres without touching callers.
 */
export abstract class CatalogRepository {
  abstract readonly dataVersion: string;
  abstract readonly publishedAt: string;

  abstract list(options: ListOptions): Promise<ListResult>;
  abstract all(): Promise<CurrencyRecord[]>;
  abstract find(isoCode: string): Promise<CurrencyRecord | undefined>;

  /** Facts of one currency; narrowed to one denomination when given. */
  abstract factsOf(isoCode: string, denomination?: number): Promise<FactRecord[]>;

  /** Facts of one currency, or of every currency when no code is given. */
  abstract allFacts(isoCode?: string): Promise<FactRecord[]>;

  /** Throws if the catalogue cannot serve requests. Used by readiness. */
  abstract ping(): Promise<void>;
}

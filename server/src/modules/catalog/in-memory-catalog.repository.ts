import { CatalogRepository, ListOptions, ListResult } from './catalog.repository';
import {
  DATA_PACK_PUBLISHED_AT,
  DATA_PACK_VERSION,
  SEED_CURRENCIES,
  SEED_FACTS,
} from './catalog.seed';
import { CurrencyRecord, FactRecord } from './catalog.types';

/** Built by a factory in CatalogModule, so Nest never injects its arguments. */
export class InMemoryCatalogRepository extends CatalogRepository {
  readonly dataVersion = DATA_PACK_VERSION;
  readonly publishedAt = DATA_PACK_PUBLISHED_AT;

  constructor(
    private readonly currencies: CurrencyRecord[] = SEED_CURRENCIES,
    private readonly facts: FactRecord[] = SEED_FACTS,
  ) {
    super();
  }

  async list({ q, limit, offset }: ListOptions): Promise<ListResult> {
    const needle = q?.trim().toLowerCase();
    const matches = needle
      ? this.currencies.filter((c) =>
          [c.isoCode, c.name, c.country].some((s) => s.toLowerCase().includes(needle)),
        )
      : this.currencies;
    return { items: matches.slice(offset, offset + limit), total: matches.length };
  }

  async all(): Promise<CurrencyRecord[]> {
    return this.currencies;
  }

  async find(isoCode: string): Promise<CurrencyRecord | undefined> {
    return this.currencies.find((c) => c.isoCode === isoCode.toUpperCase());
  }

  async factsOf(isoCode: string, denomination?: number): Promise<FactRecord[]> {
    return this.facts.filter(
      (f) =>
        f.isoCode === isoCode.toUpperCase() &&
        (denomination === undefined ||
          f.denomination === undefined ||
          f.denomination === denomination),
    );
  }

  async allFacts(isoCode?: string): Promise<FactRecord[]> {
    return isoCode
      ? this.facts.filter((f) => f.isoCode === isoCode.toUpperCase())
      : this.facts;
  }

  async ping(): Promise<void> {
    if (this.currencies.length === 0) throw new Error('The catalogue is empty.');
  }
}

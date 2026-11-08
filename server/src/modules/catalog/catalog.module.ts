import { Global, Module } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { InMemoryCatalogRepository } from './in-memory-catalog.repository';

/** Swap the factory for a Postgres repository when the database arrives. */
@Global()
@Module({
  providers: [{ provide: CatalogRepository, useFactory: () => new InMemoryCatalogRepository() }],
  exports: [CatalogRepository],
})
export class CatalogModule {}

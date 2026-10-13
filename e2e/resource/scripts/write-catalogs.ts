/**
 * Rewrites each committed public catalog from its migrations: the storage
 * contract's (resource SPEC 12.9) and the fixture of `@nizam-os/resource-ui`
 * (SPEC 20.8). `pnpm run write:catalogs` after changing them.
 */
import {
  COMMITTED_CATALOGS,
  extractCommitted,
} from '../support/committed-catalogs.ts';

for (const catalog of Object.values(COMMITTED_CATALOGS)) {
  console.log(`${await extractCommitted(catalog, false)} ${catalog.file}`);
}

/**
 * `@nizam-os/resource-core/testing`: what a test suite runs a declared
 * resource or a storage adapter against. `boundaryFixtures` generates the
 * values an oracle compares with PostgreSQL (SPEC 15.3); `oracleCases`
 * gives `pg-catalog rules --check` every fixture of a registry with how to
 * judge the database's verdict on it (SPEC 7.3); `storageContract` checks
 * an adapter against the obligations of SPEC 12.8 on the schema, catalog,
 * and declarations of `contractFixture` (SPEC 12.9).
 * @packageDocumentation
 */
export type { ResourceBoundaries } from './boundary-fixtures';
export type {
  ContractActor,
  ContractCodecs,
  ContractFixture,
  Point,
} from './contract/fixture';
export type { ContractPublicCatalog } from './contract/public-catalog';
export type { ContractCase, ContractHarness } from './contract/types';
export type { BoundaryFixture } from './fixture';
export type { TextStorageCodec } from './oracle/members';
export type { OracleOptions } from './oracle/oracle-cases';
export type {
  OracleCase,
  OracleFixture,
  OracleProbe,
  OracleVerdict,
  UnwritableFixture,
  WritableFixture,
} from './oracle/types';

export { boundaryFixtures } from './boundary-fixtures';
export { contractFixture } from './contract/fixture';
export { oracleCases } from './oracle/oracle-cases';
export { storageContract } from './storage-contract';

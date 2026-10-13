/**
 * `checkResourceRuntime(options)` (SPEC 18.3): the static checks of boot
 * for an application's test suite, which runs them without a database.
 * @packageDocumentation
 */
import type { DomainShape } from '@nizam-os/resource-core/server';

import type { RuntimeOptions } from '../runtime/types';
import type { BootReport } from './report';

import { bootContext } from './options';
import { staticReport } from './static-report';

/**
 * The problems that would keep `createResourceRuntime(options)` from
 * starting, short of those only the database knows, and the warnings.
 * Runs no query. Throws `TypeError` for an option it cannot use.
 */
export function checkResourceRuntime<TDomain extends DomainShape>(
  options: RuntimeOptions<TDomain>,
): BootReport {
  return staticReport(bootContext('checkResourceRuntime', options));
}

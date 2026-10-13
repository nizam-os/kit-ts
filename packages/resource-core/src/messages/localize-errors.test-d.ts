import type { ErrorTransform } from './localize-errors';

import { describe, expectTypeOf, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';

import { Contacts, Organizations } from '../test-support/registry';
import { defaultMessages } from './default-messages';
import { localizeErrors } from './localize-errors';

interface RouteContext {
  readonly path: string;
}

const ban = createBan();
const english = defaultMessages([Organizations, Contacts]);

describe('localizeErrors (SPEC 10.4)', () => {
  it('fits the handler of any context when it takes no resource', () => {
    expectTypeOf(localizeErrors(english)).toEqualTypeOf<
      ErrorTransform<unknown>
    >();
    expectTypeOf(
      ban.handler<RouteContext>({ transform: localizeErrors(english) }),
    ).toBeFunction();
  });

  it('gives the handler an unknown context when written inside its options', () => {
    const handle = ban.handler({ transform: localizeErrors(english) });
    expectTypeOf(handle).parameter(2).toEqualTypeOf<unknown>();
  });

  it('takes its context from resource', () => {
    const transform = localizeErrors(english, {
      resource: (ctx: RouteContext) => ctx.path.split('/')[1],
    });
    expectTypeOf(transform).parameter(2).toEqualTypeOf<RouteContext>();
    expectTypeOf(ban.handler({ transform }))
      .parameter(2)
      .toEqualTypeOf<RouteContext>();
  });

  it('asks for the context type of an unannotated resource', () => {
    ban.handler({
      transform: localizeErrors(english, {
        // @ts-expect-error ctx is unknown until resource annotates it
        resource: (ctx) => ctx.path,
      }),
    });
  });
});

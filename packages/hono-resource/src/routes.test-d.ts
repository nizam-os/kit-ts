/**
 * `jsonApiRoutes`'s types (resource SPEC 19.2): the routes take the host's
 * `Env` from the actor and the domain from the runtime, a runtime typed by
 * its behaviors included, and the actor must be the domain's.
 */
import type { Context, Hono } from 'hono';

import type { ResourceRuntime } from '@nizam-os/resource-core/server';

import type { TestEnv } from './test-support/app';
import type { Member, TestDomain } from './test-support/memory-runtime';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { createDomainDefiners } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { jsonApiRoutes } from './routes';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  links: { base: '/api' },
});
const Workspaces = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const WorkspacesBehavior = defineResource(Workspaces, {
  policy: definePolicy(Workspaces, { get: () => true }),
});

declare const typed: ResourceRuntime<
  TestDomain,
  { readonly workspaces: typeof WorkspacesBehavior }
>;
declare const wide: ResourceRuntime<TestDomain>;
declare function memberOf(c: Context<TestEnv>): Member;
declare function sessionOf(c: Context<TestEnv>): Promise<Member>;

describe('jsonApiRoutes types (resource SPEC 19.2)', () => {
  it("takes the host's Env from the actor, and a runtime typed by its behaviors", () => {
    expectTypeOf(
      jsonApiRoutes({ runtime: typed, actor: memberOf }),
    ).toEqualTypeOf<Hono<TestEnv>>();
    expectTypeOf(
      jsonApiRoutes({ runtime: wide, actor: memberOf }),
    ).toEqualTypeOf<Hono<TestEnv>>();
  });

  it("takes an actor resolved asynchronously, and only the domain's", () => {
    expectTypeOf(
      jsonApiRoutes({ runtime: wide, actor: sessionOf }),
    ).toEqualTypeOf<Hono<TestEnv>>();
    jsonApiRoutes({
      runtime: wide,
      // @ts-expect-error the actor lacks the member's workspace
      actor: () => ({ id: 'ada', can: () => true }),
    });
  });

  it('takes exactly its options', () => {
    // @ts-expect-error the actor is required
    jsonApiRoutes({ runtime: wide });
    // @ts-expect-error a prefix would make the links lie
    jsonApiRoutes({ runtime: wide, actor: memberOf, prefix: '/api' });
  });
});

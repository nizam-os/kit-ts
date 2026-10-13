/**
 * The registries the fixture declares against (resource SPEC 7.2): the
 * validator of `organizations_enterprise_verified`, `plan_id <>
 * 'enterprise' or verified`, over the public names, the relationship as
 * its id: a CHECK across a field and a relationship, which only the write
 * validators run (SPEC 6.2). Typed by an explicit interface, as an
 * exported value must be under `isolatedDeclarations`. Not published with
 * the package.
 * @packageDocumentation
 */
import type { ZodType } from 'zod';

import type { Validator } from '@nizam-os/resource-core';

import { z } from 'zod';

import { defineValidator } from '@nizam-os/resource-core';

interface EnterpriseVerified {
  readonly plan: string;
  readonly verified: boolean;
}

interface FixtureRegistries {
  readonly validators: {
    readonly enterpriseVerified: Validator<
      ZodType<EnterpriseVerified, EnterpriseVerified>
    >;
  };
}

export const FIXTURE_REGISTRIES: FixtureRegistries = {
  validators: {
    enterpriseVerified: defineValidator({
      schema: z
        .object({ plan: z.string(), verified: z.boolean() })
        .refine(({ plan, verified }) => plan !== 'enterprise' || verified),
      fixtures: {
        accept: [
          { plan: 'enterprise', verified: true },
          { plan: 'team', verified: false },
        ],
        reject: [{ plan: 'enterprise', verified: false }],
      },
    }),
  },
};

/**
 * Package surface. `@nizam-os/resource-core` and its `server`, `testing`, and
 * `openapi` entries, `@nizam-os/kysely-resource`, `@nizam-os/hono-resource`,
 * `@nizam-os/resource-ui`, and `@nizam-os/tanstack-form-resource` must resolve
 * through the published `exports` map at runtime and export exactly the
 * values the SPEC lists (sections 1, 18.1, 19.1, 20.1, and 21.1) for what
 * has shipped. Value imports on purpose: a missing dist file or a wrong
 * `exports` entry fails here before any feature test.
 */
import { describe, expect, it } from 'vitest';

import * as routes from '@nizam-os/hono-resource';
import * as runtime from '@nizam-os/kysely-resource';
import * as core from '@nizam-os/resource-core';
import * as openapi from '@nizam-os/resource-core/openapi';
import * as server from '@nizam-os/resource-core/server';
import * as testing from '@nizam-os/resource-core/testing';
import * as ui from '@nizam-os/resource-ui';
import * as form from '@nizam-os/tanstack-form-resource';

describe('package surface (SPEC 1, 18.1, 19.1, 20.1)', () => {
  it('@nizam-os/resource-core exports the documented values', () => {
    expect(Object.keys(core).toSorted()).toEqual([
      'ISSUE_KINDS',
      'createDeclareResource',
      'defaultMessages',
      'defineCodec',
      'defineMessages',
      'defineValidator',
      'errorCatalog',
      'localizeErrors',
      'localizeIssues',
    ]);
  });

  it('@nizam-os/resource-core/server exports the documented values', () => {
    expect(Object.keys(server).toSorted()).toEqual([
      'PARTITION_ROOT_SQL',
      'Rejection',
      'constraintError',
      'createDomainDefiners',
      'defineEvent',
      'defineQuota',
      'defineScope',
      'denyAll',
      'filterParameters',
      'isResourceBehavior',
      'keysetRequest',
      'partitionViolation',
      'quotaExceeded',
      'reject',
      'rejectionError',
      'relationshipTargets',
      'scopeColumnOf',
      'scopeValues',
    ]);
  });

  it('@nizam-os/resource-core/testing exports the documented values', () => {
    expect(Object.keys(testing).toSorted()).toEqual([
      'boundaryFixtures',
      'contractFixture',
      'oracleCases',
      'storageContract',
    ]);
  });

  it('@nizam-os/resource-core/openapi exports the documented values', () => {
    expect(Object.keys(openapi).toSorted()).toEqual([
      'SURFACE_FORMAT',
      'diffSurfaces',
      'openapi',
      'parseSurface',
      'surfaceOf',
    ]);
  });

  it('@nizam-os/hono-resource exports the documented values', () => {
    expect(Object.keys(routes).toSorted()).toEqual([
      'jsonApiRoutes',
      'resourceTypeOf',
    ]);
  });

  it('@nizam-os/kysely-resource exports the documented values', () => {
    expect(Object.keys(runtime).toSorted()).toEqual([
      'BootError',
      'checkResourceRuntime',
      'createKyselyStorage',
      'createResourceRuntime',
      'relayOutbox',
    ]);
  });

  it('@nizam-os/resource-ui exports the documented values', () => {
    expect(Object.keys(ui).toSorted()).toEqual([
      'bulkActions',
      'fieldsOf',
      'recordActions',
      'resourceForm',
      'resourceList',
    ]);
  });

  it('@nizam-os/tanstack-form-resource exports the documented values', () => {
    expect(Object.keys(form).toSorted()).toEqual([
      'bindResponseErrors',
      'resourceFormOptions',
    ]);
  });

  it('resolves package.json through the exports map', async () => {
    const manifest = (await import('@nizam-os/resource-core/package.json', {
      with: { type: 'json' },
    })) as { default: { name: string } };
    expect(manifest.default.name).toBe('@nizam-os/resource-core');
    const runtimeManifest = (await import(
      '@nizam-os/kysely-resource/package.json',
      { with: { type: 'json' } }
    )) as { default: { name: string } };
    expect(runtimeManifest.default.name).toBe('@nizam-os/kysely-resource');
    const formManifest = (await import(
      '@nizam-os/tanstack-form-resource/package.json',
      { with: { type: 'json' } }
    )) as { default: { name: string } };
    expect(formManifest.default.name).toBe('@nizam-os/tanstack-form-resource');
  });
});

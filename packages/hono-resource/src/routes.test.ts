/**
 * `jsonApiRoutes` (resource SPEC 19.2): the routes sit at the paths the
 * links name, each path answers its operations' methods and any other with
 * 405 and `Allow`, and the options a JavaScript caller gets wrong, or a
 * runtime whose resources cannot be served, throw `TypeError` before
 * anything is served.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { jsonApiRoutes } from './routes';
import { testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { Logs, RESOURCES, Tasks, Workspaces } from './test-support/resources';

const ADA = { 'X-Member': 'ada' };
const runtime = memoryRuntime(RESOURCES);
const actor = () => {
  throw new Error('no request runs');
};

/** A definer of the tests' catalog linked under `base`. */
function linkedUnder(base: string) {
  return createDeclareResource({
    catalog: contractFixture.catalog,
    codecs: contractFixture.codecs,
    scopes: { workspace: { column: 'workspace_id' } },
    links: { base },
  });
}

describe('jsonApiRoutes (resource SPEC 19.2)', () => {
  it('answers each declared operation at the path its links name, and nothing elsewhere', async () => {
    const app = testApp(memoryRuntime(RESOURCES, { tasks: [] }));
    expect((await app.request('/api/tasks', { headers: ADA })).status).toBe(
      200,
    );
    expect(
      (await app.request('/api/workspaces', { headers: ADA })).status,
    ).toBe(404);
    expect((await app.request('/tasks', { headers: ADA })).status).toBe(404);
  });

  it.each([
    ['/api/tasks', 'PUT', 'GET, HEAD, POST'],
    ['/api/tasks/7', 'POST', 'GET, HEAD, PATCH, DELETE'],
    ['/api/workspaces/1', 'DELETE', 'GET, HEAD'],
    ['/api/entr%C3%A9es', 'PATCH', 'GET, HEAD, POST'],
  ])('answers %s %s with 405 and Allow: %s', async (path, method, allowed) => {
    const response = await testApp(runtime).request(path, {
      method,
      headers: ADA,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe(allowed);
    expect(await response.json()).toMatchObject({
      errors: [{ status: '405', code: 'METHOD_NOT_ALLOWED' }],
    });
  });

  it('answers 405 before it resolves the actor, since the document lists every method', async () => {
    const response = await testApp(runtime).request('/api/tasks', {
      method: 'PUT',
    });
    expect(response.status).toBe(405);
  });

  it('answers HEAD with the GET route, without a body', async () => {
    const app = testApp(memoryRuntime(RESOURCES, { tasks: [] }));
    const response = await app.request('/api/tasks', {
      method: 'HEAD',
      headers: ADA,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('serves a type outside ASCII at the percent-encoded path its links name', async () => {
    const app = testApp(memoryRuntime(RESOURCES, { entrées: [] }));
    const response = await app.request('/api/entr%C3%A9es', { headers: ADA });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [] });
  });

  it('serves root-relative links at the root', async () => {
    const declareResource = linkedUnder('');
    const Notes = declareResource('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    const app = testApp(
      memoryRuntime([Notes], { workspaces: [{ id: '1', name: 'One' }] }),
    );
    const response = await app.request('/workspaces/1', { headers: ADA });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { type: 'workspaces', id: '1', links: { self: '/workspaces/1' } },
    });
  });
});

describe('jsonApiRoutes refusals (resource SPEC 19.2)', () => {
  it.each([
    [undefined, 'jsonApiRoutes: options must be an object'],
    [
      { runtime, actor, prefix: '/api' },
      'jsonApiRoutes: options.prefix is not an option',
    ],
    [
      { runtime: { resources: RESOURCES }, actor },
      'jsonApiRoutes: options.runtime must be a runtime of the contract, such as createResourceRuntime resolves to',
    ],
    [
      { runtime: { resources: RESOURCES, as: runtime.as }, actor },
      'jsonApiRoutes: options.runtime must be a runtime of the contract, such as createResourceRuntime resolves to',
    ],
    [
      { runtime, actor: 'ada' },
      'jsonApiRoutes: options.actor must be a function from the request to its actor',
    ],
  ])('refuses the options %o', (options, message) => {
    // @ts-expect-error what a JavaScript caller may pass
    expect(() => jsonApiRoutes(options)).toThrow(new TypeError(message));
  });

  it('refuses a runtime that runs no resource', () => {
    expect(() => jsonApiRoutes({ runtime: memoryRuntime([]), actor })).toThrow(
      new TypeError(
        'jsonApiRoutes: the runtime runs no resource, so there is nothing to serve',
      ),
    );
  });

  it('refuses a resource whose links give no paths, as resourcePaths does', () => {
    const declareResource = createDeclareResource({
      catalog: contractFixture.catalog,
      codecs: contractFixture.codecs,
    });
    const Unlinked = declareResource('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Unlinked]), actor }),
    ).toThrow(
      new TypeError(
        'resourcePaths: workspaces has no links.self, so its paths are unknown; give the definer links.base',
      ),
    );
  });

  it('refuses links with different origins or bases', () => {
    const Elsewhere = linkedUnder('https://api.example.com/api')('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Logs, Elsewhere]), actor }),
    ).toThrow(
      new TypeError(
        "jsonApiRoutes: the resources' links have different origins (root-relative, https://api.example.com); the routes serve one",
      ),
    );
    const Versioned = linkedUnder('/v2')('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Logs, Versioned]), actor }),
    ).toThrow(
      new TypeError(
        "jsonApiRoutes: the resources' links have different bases (/api, /v2); every collection sits under one",
      ),
    );
  });

  it('refuses two routes that have one path', () => {
    const Again = linkedUnder('/api')('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Workspaces, Again]), actor }),
    ).toThrow(
      new TypeError('jsonApiRoutes: two routes have the path /api/workspaces'),
    );
  });

  it('refuses a relationship whose target the runtime does not run, includable or not', () => {
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Tasks]), actor }),
    ).toThrow(
      new TypeError(
        'jsonApiRoutes: tasks: relationship workspace targets workspaces, which the runtime does not run',
      ),
    );
    expect(() =>
      jsonApiRoutes({ runtime: memoryRuntime([Logs]), actor }),
    ).toThrow(
      new TypeError(
        'jsonApiRoutes: entrées: relationship owner targets workspaces, which the runtime does not run',
      ),
    );
  });
});

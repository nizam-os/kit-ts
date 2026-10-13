/**
 * `hrefTargets` (resource SPEC 19.4): an `href`, resolved against the
 * endpoint's URL, names what the route its path matches serves, as Hono
 * matches and decodes a request's path; any other names nothing.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://www.rfc-editor.org/rfc/rfc3986#section-5.2
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { hrefTargets } from './hrefs';
import { planPaths } from './paths';
import { RESOURCES } from './test-support/resources';

const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
const resolve = hrefTargets(planPaths(RESOURCES), '/api/operations');

describe('hrefTargets (resource SPEC 19.4)', () => {
  it.each([
    ['/api/tasks', { type: 'tasks' }],
    [`/api/tasks/${TASK}`, { type: 'tasks', id: TASK }],
    [
      `/api/tasks/${TASK}/relationships/parent`,
      { type: 'tasks', id: TASK, relationship: 'parent' },
    ],
    ['/api/workspaces/1', { type: 'workspaces', id: '1' }],
    ['/api/entr%C3%A9es', { type: 'entrées' }],
    ['/api/entrées/7', { type: 'entrées', id: '7' }],
    ['/api/tasks/a%2Fb', { type: 'tasks', id: 'a/b' }],
    ['/api/tasks/100%25', { type: 'tasks', id: '100%' }],
    [`tasks/${TASK}`, { type: 'tasks', id: TASK }],
    [`../api/tasks/${TASK}`, { type: 'tasks', id: TASK }],
  ])('resolves %s', (href, target) => {
    expect(resolve(href)).toEqual(target);
  });

  it.each([
    [`/api/tasks/${TASK}/parent`, 'a related link'],
    [`/api/tasks/${TASK}/`, 'a trailing slash, as strict routing reads it'],
    [`/api/tasks/${TASK}?include=parent`, 'a query'],
    [`/api/tasks/${TASK}#top`, 'a fragment'],
    [
      `https://api.example.com/api/tasks/${TASK}`,
      'an absolute URL beside root-relative links',
    ],
    [`//api.example.com/api/tasks/${TASK}`, 'a network-path reference'],
    ['/api/projects/1', 'a path no route matches'],
    ['/api/tasks/', 'an empty id'],
    ['http://[', 'a reference that does not parse'],
  ])('names nothing for %s (%s)', (href) => {
    expect(resolve(href)).toBeUndefined();
  });

  it("resolves an absolute link's origin, and nothing beside it", () => {
    const declareResource = createDeclareResource({
      catalog: contractFixture.catalog,
      codecs: contractFixture.codecs,
      links: { base: 'https://api.example.com/v1' },
    });
    const Workspaces = declareResource('workspaces', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    const absolute = hrefTargets(planPaths([Workspaces]), '/v1/operations');
    expect(absolute('https://api.example.com/v1/workspaces/1')).toEqual({
      type: 'workspaces',
      id: '1',
    });
    expect(absolute('/v1/workspaces/1')).toEqual({
      type: 'workspaces',
      id: '1',
    });
    expect(
      absolute('https://other.example.com/v1/workspaces/1'),
    ).toBeUndefined();
    expect(absolute('http://api.example.com/v1/workspaces/1')).toBeUndefined();
  });
});

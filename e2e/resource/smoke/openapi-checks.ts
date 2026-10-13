/**
 * Checks of the built `@nizam-os/resource-core/openapi` entry (resource
 * SPEC 13, 15.4): the contacts application's resources make an OpenAPI
 * 3.1.2 document whose responses reference error objects and lone
 * responses in its components, and two surfaces diff with a removed type
 * as a breaking change. No Node.js API, so the same module runs on Bun,
 * Deno, and workerd.
 */
import type { Checks } from './report.ts';

import {
  diffSurfaces,
  openapi,
  surfaceOf,
} from '@nizam-os/resource-core/openapi';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const NOT_FOUND = '_error.NOT_FOUND';

export const openapiChecks: Checks = {
  'documents the contacts application': () => {
    const document = openapi([Organizations, Contacts], {
      info: { title: 'Contacts', version: '1.0.0' },
    });
    const text = JSON.stringify(document);
    check(document.openapi === '3.1.2', document.openapi);
    check(
      Object.hasOwn(document.paths, '/api/contacts/{id}'),
      'no contact path',
    );
    check(
      Object.hasOwn(document.components.schemas, NOT_FOUND) &&
        text.includes(`"#/components/schemas/${NOT_FOUND}"`),
      'NOT_FOUND is not a referenced component',
    );
    check(
      Object.hasOwn(document.components.responses, NOT_FOUND) &&
        text.includes(`"#/components/responses/${NOT_FOUND}"`),
      "NOT_FOUND's response is not a referenced component",
    );
  },
  'diffs two surfaces': () => {
    const before = surfaceOf([Organizations, Contacts]);
    const changes = diffSurfaces(before, surfaceOf([Organizations]));
    check(
      diffSurfaces(before, before).length === 0,
      'a surface differs from itself',
    );
    const [removed] = changes;
    check(
      changes.length === 1 &&
        removed?.change === 'removed' &&
        removed.breaking &&
        removed.path.join('.') === 'contacts',
      JSON.stringify(changes.map(({ path, change }) => ({ path, change }))),
    );
  },
};

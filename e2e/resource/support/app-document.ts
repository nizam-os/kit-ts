/**
 * The contacts application's OpenAPI document (resource SPEC 13.1): its
 * registry, its own codes, and the codes its rules, its quota, and its
 * authentication raise, which the declarations cannot know.
 */
import type {
  OpenApiDocument,
  OpenApiOptions,
} from '@nizam-os/resource-core/openapi';

import { openapi } from '@nizam-os/resource-core/openapi';

import { APP_RESOURCES } from '../runtime/api.ts';
import { APP_ERRORS } from '../runtime/domain.ts';

export const APP_DOCUMENT_OPTIONS: OpenApiOptions = {
  info: { title: 'Contacts', version: '1.0.0' },
  appErrors: APP_ERRORS,
  codes: {
    all: ['UNAUTHORIZED'],
    resources: {
      contacts: {
        create: ['PLAN_UPGRADE_REQUIRED', 'QUOTA_EXCEEDED'],
        update: ['CONTACT_ARCHIVED'],
      },
    },
  },
};

export const APP_DOCUMENT: OpenApiDocument = openapi(
  APP_RESOURCES,
  APP_DOCUMENT_OPTIONS,
);

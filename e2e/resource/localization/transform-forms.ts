/**
 * The forms an application writes the transform in, each of which must
 * compile against Hono's `Context` (resource SPEC 10.4): inside
 * `ban.onError()`'s options with no resource, with an annotated resource,
 * and built apart. Inside the options, the handler's environment is not
 * inferred yet when the transform's type is, which `localizeErrors` must
 * not read as a `never` context.
 */
import type { Context } from 'hono';

import { createBan } from '@nizam-os/hono-ban';
import { localizeErrors } from '@nizam-os/resource-core';

import { contactMessages } from './contact-messages.ts';

const ban = createBan();

export const plain = ban.onError({
  transform: localizeErrors(contactMessages),
});

export const annotated = ban.onError({
  transform: localizeErrors(contactMessages, {
    resource: (c: Context) => c.req.path.split('/')[1],
  }),
});

const transform = localizeErrors(contactMessages, {
  resource: (c: Context) => c.req.path.split('/')[1],
});

export const apart = ban.onError({ transform });

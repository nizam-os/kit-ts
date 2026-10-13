/**
 * The blog API every e2e file and the runtime smoke test drive: one Hono
 * app built only from the published package. Never imports from `src/`.
 */
import type { JsonApiEnv } from '@nizam-os/hono-jsonapi';

import { Hono } from 'hono';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  notFoundHandler,
} from '@nizam-os/hono-jsonapi';
import { atomicOperations } from '@nizam-os/hono-jsonapi/atomic';

import { atomicOptions } from './operations.ts';
import { registerRoutes } from './routes.ts';
import { Store } from './store.ts';

export { BASE_URL } from './resources.ts';

export interface BlogApp {
  readonly app: Hono<JsonApiEnv>;
  readonly store: Store;
}

export function createBlog(): BlogApp {
  const store = new Store();
  const app = new Hono<JsonApiEnv>();
  app.use(
    jsonApi({
      extensions: [ATOMIC_OPERATIONS_EXTENSION],
      profiles: [CURSOR_PAGINATION_PROFILE],
    }),
  );
  app.onError(errorHandler({ headers: { 'Cache-Control': 'no-store' } }));
  app.notFound(notFoundHandler());
  registerRoutes(app, store);
  app.post('/operations', atomicOperations(atomicOptions(store)));
  return { app, store };
}

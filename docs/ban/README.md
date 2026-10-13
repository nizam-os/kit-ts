# ban: structured HTTP errors

Structured, extensible HTTP errors for JavaScript APIs: one typed catalog, one handler that turns
anything thrown into a well-formed response, and pluggable wire formats (RFC 9457 Problem Details,
JSON:API, Google's AIP-193, Stripe, or your own). Two packages, same subpaths:

| Package                                                | Use it when                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`@nizam-os/ban-core`](../../packages/ban-core#readme) | you render errors from a `fetch` handler, a worker, a library, or a test; no framework, no peers                   |
| [`@nizam-os/hono-ban`](../../packages/hono-ban#readme) | you are on [Hono](https://hono.dev): `@nizam-os/ban-core` plus `app.onError()` wiring and `HTTPException` adoption |

## Install

```bash
pnpm add @nizam-os/ban-core
# or, on Hono
pnpm add @nizam-os/hono-ban hono
```

## Quick start

```ts
import { Hono } from 'hono';

import { createBan } from '@nizam-os/hono-ban';

const ban = createBan({
  errors: { ORDER_CONFLICT: { status: 409, title: 'Order Conflict' } },
});
const app = new Hono();
app.onError(ban.onError());

app.get('/orders/:id', async (c) => {
  const order = await orders.find(c.req.param('id'));
  if (!order) throw ban.notFound(`Order ${c.req.param('id')} does not exist`);
  return c.json(order);
});
```

```ts
import { createBan, fromRequest } from '@nizam-os/ban-core';

const ban = createBan();
const handle = ban.handler();

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await route(request);
    } catch (thrown) {
      return handle(thrown, fromRequest(request));
    }
  },
};
```

Both answer with the same body, header, and report:

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json
Cache-Control: no-store
X-Error-Id: 6f1c2f0e-...

{
  "type": "about:blank",
  "status": 404,
  "title": "Not Found",
  "detail": "Order 42 does not exist",
  "instance": "/orders/42",
  "code": "NOT_FOUND",
  "id": "6f1c2f0e-..."
}
```

The package READMEs walk through formats, validation, OpenAPI, observability, database errors, and
custom formats.

## Documentation

- [`docs/ban/DESIGN.md`](./DESIGN.md): goals, the full API, architecture, security defaults, and
  roadmap
- [`docs/ban/SPEC.md`](./SPEC.md): the normative implementation specification (exact types, catalog,
  rendering rules, handler algorithm, validator mappings, packaging, test plan)
- [`docs/ban/adr/`](./adr/): architecture decision records
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): the family's contribution guide; setup, gates, and
  releases are in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- [`packages/hono-ban/CHANGELOG.md`](../../packages/hono-ban/CHANGELOG.md): @nizam-os/hono-ban's
  history, including the 2.0 migration notes

## Repository

In this repository: `packages/ban-core` (the core), `packages/hono-ban` (the Hono binding),
`docs/ban/` (this directory), and `e2e/ban/` (the end-to-end suite over the built packages, plus the
Bun, Deno, and workerd smoke test). Node 22.12+ at runtime; CI runs the suites on Node 22 and 24.

## License

[MIT](../../LICENSE)

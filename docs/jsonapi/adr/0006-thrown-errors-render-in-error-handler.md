# ADR 0006: Thrown errors render in `errorHandler`; validators and `jsonApi()` answer their own

- Status: superseded by ADR-0014 (errors are @nizam-os/ban-core errors; `errorHandler` is a
  @nizam-os/hono-ban handler, and validators, `jsonApi()`, and the atomic endpoint throw instead of
  rendering their own)
- Date: 2026-10-08

## Context

Hono's `compose` catches an error thrown by a route or a downstream middleware at each level of the
chain and hands it to `app.onError` directly; middleware above the route never sees it, so a
`try`/`catch` around `await next()` cannot render thrown `JsonApiError`s. An error document also has
to be the shape every client sees for every failure, including Hono's own `HTTPException` and
unexpected exceptions, and nothing about the server may reach a client that a factory did not put
there. @ref https://hono.dev/docs/api/hono#error-handling @ref
https://github.com/honojs/hono/blob/v4.13.7/src/compose.ts

## Decision

`errorHandler()` (for `app.onError`) is the one place thrown errors become responses: a
`JsonApiError` as is, an `HTTPException` with a registered 4xx or 5xx status by status with the RFC
9110 reason phrase as `title` and its message as `detail`, and anything else as a constant 500 whose
`detail` is "An unexpected error occurred". The thrown value stays on `cause` and reaches `report`;
a reporter that throws is ignored. The validators and `jsonApi()` render their own rejections
through `respondError`, so a rejected request is JSON:API even on an app without `errorHandler()`.
`notFoundHandler()` gives unmatched routes the same shape. `JsonApiError` is also recognized
structurally (`name`, `errors`, `status`) so a second installed copy of the package still renders.

## Consequences

Installing `app.onError(errorHandler())` is part of the quick start, not optional for apps that
throw `JsonApiError`. Driver and policy messages never reach a client; applications that want a
specific message put it in a factory call.

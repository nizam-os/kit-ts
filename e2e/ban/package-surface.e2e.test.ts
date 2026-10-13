import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Package surface. Every subpath in SPEC section 1 must resolve through the
 * published `exports` map at runtime and export what the SPEC lists. The
 * imports below are value imports on purpose: a missing dist file or a wrong
 * `exports` entry fails here before any feature test runs.
 */
import * as kit from '@nizam-os/ban-core';
import * as kitJsonApi from '@nizam-os/ban-core/formats/json-api';
import * as kitProblemDetails from '@nizam-os/ban-core/formats/problem-details';
import * as kitOpenapi from '@nizam-os/ban-core/openapi';
import * as kitTesting from '@nizam-os/ban-core/testing';
import * as kitZod from '@nizam-os/ban-core/zod';
import * as root from '@nizam-os/hono-ban';
import * as googleApi from '@nizam-os/hono-ban/formats/google-api';
import * as jsonApi from '@nizam-os/hono-ban/formats/json-api';
import * as plain from '@nizam-os/hono-ban/formats/plain';
import * as problemDetails from '@nizam-os/hono-ban/formats/problem-details';
import * as stripe from '@nizam-os/hono-ban/formats/stripe';
import * as openapi from '@nizam-os/hono-ban/openapi';
import * as otel from '@nizam-os/hono-ban/otel';
import * as postgres from '@nizam-os/hono-ban/postgresql';
import * as standardSchema from '@nizam-os/hono-ban/standard-schema';
import * as testing from '@nizam-os/hono-ban/testing';
import * as valibot from '@nizam-os/hono-ban/valibot';
import * as zod from '@nizam-os/hono-ban/zod';

import { startServer } from './support/server';

/** Sorted export names, so lists compare independent of module order. */
function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

function sorted(list: Array<string>): Array<string> {
  return list.toSorted();
}

const CORE_ROOT = [
  'BUILTIN_CATALOG',
  'BanError',
  'FACTORY_NAMES',
  'assert',
  'bearerChallenge',
  'createBan',
  'defineFormat',
  'fromRequest',
  'isBanError',
  'isErrorStatus',
  'locationFromTarget',
  'nameFromPath',
  'parseTraceparent',
  'pointerFromPath',
  'problemDetails',
  'reasonPhrase',
  'resolveDefinition',
];

describe('package surface', () => {
  it('@nizam-os/ban-core root exports the SPEC section 1 values', () => {
    expect(names(kit)).toEqual(sorted(CORE_ROOT));
  });

  it('@nizam-os/hono-ban root re-exports the core and adds the Hono members', () => {
    expect(names(root)).toEqual(sorted([...CORE_ROOT, 'fromHttpException']));
    expect(root.BanError).toBe(kit.BanError);
    expect(root.createBan).not.toBe(kit.createBan);
    expect('onError' in kit.createBan()).toBe(false);
    expect(typeof root.createBan().onError).toBe('function');
  });

  it('format subpaths export their factory and content type', () => {
    expect(names(problemDetails)).toEqual(
      sorted(['PROBLEM_DETAILS_CONTENT_TYPE', 'problemDetails']),
    );
    expect(names(jsonApi)).toEqual(
      sorted(['JSON_API_CONTENT_TYPE', 'jsonApi', 'responseStatus']),
    );
    expect(names(plain)).toEqual(sorted(['PLAIN_CONTENT_TYPE', 'plain']));
    expect(names(googleApi)).toEqual(
      sorted(['GOOGLE_API_CONTENT_TYPE', 'googleApi']),
    );
    expect(names(stripe)).toEqual(sorted(['STRIPE_CONTENT_TYPE', 'stripe']));
    expect(problemDetails.PROBLEM_DETAILS_CONTENT_TYPE).toBe(
      'application/problem+json',
    );
    expect(jsonApi.JSON_API_CONTENT_TYPE).toBe('application/vnd.api+json');
    expect(plain.PLAIN_CONTENT_TYPE).toBe('application/json');
    expect(googleApi.GOOGLE_API_CONTENT_TYPE).toBe('application/json');
    expect(stripe.STRIPE_CONTENT_TYPE).toBe('application/json');
  });

  it('validator subpaths export hooks and converters', () => {
    expect(names(zod)).toEqual(
      sorted(['defaultHook', 'fromZodError', 'hook', 'toIssues']),
    );
    expect(names(valibot)).toEqual(
      sorted(['fromValibotIssues', 'hook', 'toIssues']),
    );
    expect(names(standardSchema)).toEqual(
      sorted(['fromIssues', 'hook', 'toIssues']),
    );
  });

  it('openapi, otel, postgres and testing subpaths export their helpers', () => {
    expect(names(openapi)).toEqual(
      sorted([
        'errorObjectSchemas',
        'errorResponse',
        'errorResponseObjects',
        'errorResponses',
        'errorSchema',
        'validationResponse',
        'validationSchema',
      ]),
    );
    expect(names(otel)).toEqual(['traceIdFromOtel']);
    expect(names(postgres)).toEqual(
      sorted(['findPostgresError', 'postgresMapper', 'readPostgresFields']),
    );
    expect(names(testing)).toEqual(
      sorted(['assertFormatConformance', 'expectBanError', 'renderError']),
    );
  });

  it('@nizam-os/hono-ban subpaths are the @nizam-os/ban-core modules', () => {
    expect(problemDetails.problemDetails).toBe(
      kitProblemDetails.problemDetails,
    );
    expect(jsonApi.jsonApi).toBe(kitJsonApi.jsonApi);
    expect(openapi.errorSchema).toBe(kitOpenapi.errorSchema);
    expect(testing.expectBanError).toBe(kitTesting.expectBanError);
    expect(zod.hook).toBe(kitZod.hook);
    expect(root.problemDetails).toBe(problemDetails.problemDetails);
  });
});

describe('built package over HTTP', () => {
  const ban = root.createBan();
  const app = new Hono();
  app.onError(ban.onError());
  app.get('/missing', () => {
    throw ban.notFound('Order 42 does not exist');
  });
  const server = startServer(app);

  afterAll(async () => {
    await (await server).close();
  });

  it('serves a Problem Details response from a real server', async () => {
    const res = await (await server).fetch('/missing');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({
      status: 404,
      title: 'Not Found',
      detail: 'Order 42 does not exist',
      code: 'NOT_FOUND',
      instance: '/missing',
    });
  });
});

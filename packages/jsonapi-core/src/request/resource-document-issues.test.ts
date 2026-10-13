import type { ErrorObject } from '../document/types';
import type {
  StandardSchema,
  StandardSchemaIssue,
} from '../internal/standard-schema-types';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseCreateDocument } from './resource-document';

/** A validator that reports `issues` for every input, as a vendor with its own issue members does. */
function reporting(
  issues: ReadonlyArray<StandardSchemaIssue>,
): StandardSchema<unknown, unknown> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => ({ issues }),
    },
  };
}

function notes(issues: ReadonlyArray<StandardSchemaIssue>) {
  return defineResource({
    type: 'notes',
    attributes: ['body'],
    serialize: (row: { readonly id: string }) => ({ id: row.id }),
    validate: { create: reporting(issues) },
  });
}

async function errorsOf(
  promise: Promise<unknown>,
): Promise<ReadonlyArray<ErrorObject>> {
  try {
    await promise;
  } catch (error) {
    if (isBanError(error)) {
      expect(error.status).toBe(422);
      return errorObjects(error);
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

const DOCUMENT = { data: { type: 'notes', attributes: { body: 'x' } } };

describe('validation issues on the wire (SPEC 9.2)', () => {
  it("keeps an issue's code and expected as the item's meta.code and meta.expected", async () => {
    const issue = {
      message: 'Must be at most 200 characters.',
      path: ['body'],
      code: 'maxLength',
      expected: '200',
    };
    expect(
      await errorsOf(parseCreateDocument(notes([issue]), DOCUMENT)),
    ).toEqual([
      {
        id: expect.any(String),
        status: '422',
        code: 'VALIDATION_FAILED',
        title: 'Validation Failed',
        detail: 'Must be at most 200 characters.',
        source: { pointer: '/data/attributes/body' },
        meta: { code: 'maxLength', expected: '200' },
      },
    ]);
  });

  it('keeps only string members, and nothing else of the issue', async () => {
    const issues = [
      { message: 'A', path: ['body'], code: 7, expected: { min: 1 } },
      {
        message: 'B',
        path: ['body'],
        expected: 'uuid',
        received: 'abc',
        input: 'abc',
      },
      { message: 'C', path: ['body'] },
    ];
    const errors = await errorsOf(parseCreateDocument(notes(issues), DOCUMENT));
    expect(errors.map((error) => error.meta)).toEqual([
      undefined,
      { expected: 'uuid' },
      undefined,
    ]);
  });

  it("carries a Zod issue's own code, which is the validator's and never a catalog code", async () => {
    const Notes = defineResource({
      type: 'notes',
      attributes: ['body'],
      serialize: (row: { readonly id: string }) => ({ id: row.id }),
      validate: { create: z.object({ body: z.string() }) },
    });
    const errors = await errorsOf(
      parseCreateDocument(Notes, {
        data: { type: 'notes', attributes: { body: 5 } },
      }),
    );
    expect(errors).toMatchObject([
      {
        code: 'VALIDATION_FAILED',
        source: { pointer: '/data/attributes/body' },
        meta: { code: 'invalid_type', expected: 'string' },
      },
    ]);
  });
});

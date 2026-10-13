/**
 * `filterParameters` (SPEC 11.2, 18.5): each condition of the filter
 * `keysetRequest` builds, by its path in that filter, with the query
 * parameter it came in as the request spelled it, so the path keyset-core
 * gives a refused value leads back to that parameter.
 */
import type { Filter, NoRelations } from '@nizam-os/keyset-core';

import { describe, expect, it } from 'vitest';

import { parseQuery } from '@nizam-os/jsonapi-core';
import {
  createDefineKeyset,
  InvalidFilterValueError,
} from '@nizam-os/keyset-core';

import { Kinds } from '../test-support/keyset-kinds';
import { filterParameters, keysetRequest } from './keyset-request';

const keyset = createDefineKeyset({
  cursor: { secret: 'a cursor secret of at least thirty-two bytes' },
})(Kinds.keyset);

/** The node at `path` in `filter`. */
function at(
  filter: Filter<string, NoRelations> | undefined,
  path: ReadonlyArray<string | number>,
): unknown {
  return path.reduce<unknown>(
    (node, member) => (node as Record<string | number, unknown>)[member],
    filter,
  );
}

/** Each condition's path and parameter, checked against the filter `keysetRequest` builds. */
function parametersOf(query: string) {
  const parsed = parseQuery(Kinds.resource, query);
  const { filter } = keysetRequest(Kinds, parsed);
  const parameters = filterParameters(Kinds, parsed);
  for (const { path, parameter } of parameters) {
    expect(at(filter, path)).toMatchObject({
      field: /^filter(?:\[or\]\[\d+\])?\[(\w+)\]/u.exec(parameter)?.[1],
    });
  }
  return parameters;
}

describe('filterParameters', () => {
  it('names each condition by its path in the filter, as the request spelled its parameter', () => {
    expect(
      parametersOf(
        'filter[label]=a&filter[or][0][count][gt]=1&filter[or][0][count][isNull]=true&filter[or][1][mood][in]=calm',
      ),
    ).toEqual([
      { path: ['and', 0], parameter: 'filter[label]' },
      { path: ['and', 1, 'or', 0], parameter: 'filter[or][0][count][gt]' },
      { path: ['and', 1, 'or', 1], parameter: 'filter[or][0][count][isNull]' },
      { path: ['and', 2], parameter: 'filter[or][1][mood][in]' },
    ]);
  });

  it('gives a lone condition or group the paths of the filter it stands for', () => {
    expect(parametersOf('filter[or][0][label]=a')).toEqual([
      { path: [], parameter: 'filter[or][0][label]' },
    ]);
    expect(
      parametersOf('filter[or][3][label]=a&filter[or][3][label][ne]=b'),
    ).toEqual([
      { path: ['or', 0], parameter: 'filter[or][3][label]' },
      { path: ['or', 1], parameter: 'filter[or][3][label][ne]' },
    ]);
    expect(parametersOf('sort=label')).toEqual([]);
  });

  it('leads from each path keyset-core gives a refused value to the parameter it came in', async () => {
    const parsed = parseQuery(
      Kinds.resource,
      'filter[count][gte]=many&filter[mood]=angry&filter[or][0][active]=yes&filter[or][0][label]=a',
    );
    const refused = await keyset.plan(keysetRequest(Kinds, parsed)).then(
      () => [],
      (error: unknown) =>
        error instanceof InvalidFilterValueError ? error.values : [],
    );
    const parameters = filterParameters(Kinds, parsed);
    expect(
      refused.map(
        ({ path }) =>
          parameters.find((entry) => entry.path.join('/') === path.join('/'))
            ?.parameter,
      ),
    ).toEqual(['filter[count][gte]', 'filter[mood]', 'filter[or][0][active]']);
  });
});

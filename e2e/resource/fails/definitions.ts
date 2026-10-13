/**
 * Declarations whose derived keyset or JSON:API resource
 * `@nizam-os/keyset-core` or `@nizam-os/jsonapi-core` would refuse (resource
 * SPEC 11.2, 14). Each `// error:` names a text the diagnostic on the next
 * line must contain.
 */
import { declareResource } from '../resources/declare-resource.ts';
import { Organizations } from '../resources/organizations.ts';

declareResource('contacts', {
  operations: ['list'],
  fields: {
    // error: filter: list at least one operator
    name: { access: 'read', filter: [] },
    // error: filter: an operator is listed twice
    nickname: { access: 'read', filter: ['eq', 'in', 'eq'] },
  },
  relationships: {
    // error: filter: an operator is listed twice
    organization_id: {
      target: () => Organizations,
      access: 'read',
      filter: ['in', 'in'],
    },
  },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {
    // error: filter: public name "größe" is outside @nizam-os/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)
    name: { access: 'read', as: 'größe', filter: ['eq'] },
    // error: sort: public name "nick name" is outside @nizam-os/keyset-core's field names
    nickname: { access: 'read', as: 'nick name', sort: true },
    // error: filter: public name "or" is the filter disjunction, filter[or]
    email: { access: 'read', as: 'or', filter: ['eqi'] },
    // error: filter: public name "q" is the search parameter, filter[q]
    kind: { access: 'read', as: 'q', filter: ['eq'] },
  },
  search: { column: 'search' },
});

declareResource('contacts', {
  operations: ['list'],
  fields: { name: { access: 'read', sort: true } },
  // error: sort.default: a field is listed twice
  sort: { default: ['-name', 'name'] },
});

declareResource('contacts', {
  operations: ['list'],
  fields: {},
  // error: search.config: "Simple" is not a text search configuration @nizam-os/keyset-core accepts (^[a-z_][a-z0-9_]{0,62}$)
  search: { column: 'search', config: 'Simple' },
});

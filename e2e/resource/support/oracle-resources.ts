/**
 * The oracle's declarations (resource SPEC 15.3): every column of the
 * oracle's tables as a writable field, and one relationship per key type,
 * so `schema.update` and `linkage.update` hold a schema for each; `KEYS`
 * holds the key tables' resources, whose ids the id suite checks (SPEC
 * 3.4).
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/oracle/public-catalog.ts';

export { publicCatalog };

const declareResource = createDeclareResource({ catalog: publicCatalog });
const rw = { access: 'readWrite' } as const;
const key = { operations: ['get'], fields: {} } as const;

export const Texts = declareResource('texts', {
  operations: ['update'],
  fields: {
    plain: rw,
    short: rw,
    padded: rw,
    letter: rw,
    loose: rw,
    sized: rw,
    nonempty: rw,
    word: rw,
    state: rw,
    code: rw,
    status: rw,
    tags: rw,
    codes: rw,
  },
});

export const Numbers = declareResource('numbers', {
  operations: ['update'],
  fields: {
    small: rw,
    regular: rw,
    big: rw,
    single: rw,
    double: rw,
    amount: rw,
    whole: rw,
    exact: rw,
    ranged: rw,
    floor: rw,
    scaled: rw,
    share: rw,
    price: rw,
    pct: rw,
    counts: rw,
  },
});

export const Others = declareResource('others', {
  operations: ['update'],
  fields: {
    key: rw,
    day: rw,
    local_at: rw,
    local_ms: rw,
    at: rw,
    at_s: rw,
    flag: rw,
    data: rw,
    datab: rw,
    feeling: rw,
    calm: rw,
    days: rw,
    keys: rw,
    flags: rw,
  },
});

const KeySmallints = declareResource('key_smallints', key);
const KeyBigints = declareResource('key_bigints', key);
const KeyNumerics = declareResource('key_numerics', key);
const KeyReals = declareResource('key_reals', key);
const KeyDoubles = declareResource('key_doubles', key);
const KeyBooleans = declareResource('key_booleans', key);
const KeyTexts = declareResource('key_texts', key);
const KeyUuids = declareResource('key_uuids', key);
const KeyDates = declareResource('key_dates', key);
const KeyInstants = declareResource('key_instants', key);
const KeyMoods = declareResource('key_moods', key);
const KeyLocals = declareResource('key_locals', key);
const KeyCodes = declareResource('key_codes', key);
const KeyNames = declareResource('key_names', key);
const KeyAmounts = declareResource('key_amounts', key);
const KeyWholes = declareResource('key_wholes', key);
const KeyIntegers = declareResource('key_integers', key);

/** Every key table's resource. */
export const KEYS = [
  KeySmallints,
  KeyIntegers,
  KeyBigints,
  KeyNumerics,
  KeyWholes,
  KeyAmounts,
  KeyReals,
  KeyDoubles,
  KeyBooleans,
  KeyTexts,
  KeyCodes,
  KeyNames,
  KeyUuids,
  KeyDates,
  KeyLocals,
  KeyInstants,
  KeyMoods,
] as const;

export const Links = declareResource('links', {
  operations: ['update'],
  fields: {},
  relationships: {
    smallint_id: { target: () => KeySmallints, access: 'readWrite' },
    bigint_id: { target: () => KeyBigints, access: 'readWrite' },
    numeric_id: { target: () => KeyNumerics, access: 'readWrite' },
    real_id: { target: () => KeyReals, access: 'readWrite' },
    double_id: { target: () => KeyDoubles, access: 'readWrite' },
    boolean_id: { target: () => KeyBooleans, access: 'readWrite' },
    text_id: { target: () => KeyTexts, access: 'readWrite' },
    uuid_id: { target: () => KeyUuids, access: 'readWrite' },
    date_id: { target: () => KeyDates, access: 'readWrite' },
    instant_id: { target: () => KeyInstants, access: 'readWrite' },
    mood_id: { target: () => KeyMoods, access: 'readWrite' },
    local_id: { target: () => KeyLocals, access: 'readWrite' },
    code_id: { target: () => KeyCodes, access: 'readWrite' },
    name_id: { target: () => KeyNames, access: 'readWrite' },
    amount_id: { target: () => KeyAmounts, access: 'readWrite' },
    whole_id: { target: () => KeyWholes, access: 'readWrite' },
    integer_id: { target: () => KeyIntegers, access: 'readWrite' },
  },
});

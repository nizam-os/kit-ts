/**
 * The compiled fixture messages on the runtime under test (SPEC 7.3): each
 * value isolated in either direction, and the Arabic plural form Paraglide
 * selects through the runtime's `Intl.PluralRules`, around the count the
 * core formats. They come in as `#compiled-messages`, a subpath import that
 * Bun and Deno resolve and the workerd bundle inlines.
 * @ref https://nodejs.org/api/packages.html#subpath-imports
 */
import type { Check } from './assert.ts';

import { m } from '#compiled-messages';

import { createIntl, isolate } from '@nizam-os/intl-core';

import { equal } from './assert.ts';

const intl = createIntl({
  locale: () => 'ar',
  timeZone: () => 'UTC',
  formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn' },
});

/** A count for each Arabic form, and the form as the fixture writes it. */
const ARABIC_FORMS: ReadonlyArray<readonly [number, string]> = [
  [0, 'لا عناصر'],
  [1, 'عنصر واحد'],
  [2, 'عنصران'],
  [3, `${isolate('3')} عناصر`],
  [11, `${isolate('11')} عنصرًا`],
  [100, `${isolate('100')} عنصر`],
];

export const MESSAGE_CHECKS: Readonly<Record<string, Check>> = {
  'isolates each value a compiled message interpolates': () => {
    equal(
      m.shared_by({ name: 'محمد', count: '2' }, { locale: 'en' }),
      `Shared by ${isolate('محمد')} (${isolate('2')})`,
      'English',
    );
    equal(
      m.shared_by({ name: 'Casey', count: '2' }, { locale: 'ar' }),
      `شاركه ${isolate('Casey')} (${isolate('2')})`,
      'Arabic',
    );
  },
  'selects the Arabic plural form on the raw count': () => {
    for (const [count, form] of ARABIC_FORMS) {
      equal(
        m.items({ count, countText: intl.number(count) }, { locale: 'ar' }),
        form,
        `${count} items`,
      );
    }
  },
};

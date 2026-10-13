/**
 * The configured keyset definer the suite gives the reference adapter
 * (resource SPEC 11.2): the server's own `createDefineKeyset`, holding the
 * cursor secret a declared resource's keyset definition leaves out.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/keyset/SPEC.md (section 3.6, createDefineKeyset)
 */
import type { DefineDefaultedKeyset } from '@nizam-os/keyset-core';

import { createDefineKeyset } from '@nizam-os/keyset-core';

/** The definer of every keyset the reference adapter pages with. */
export const DEFINE_KEYSET: DefineDefaultedKeyset = createDefineKeyset({
  cursor: { secret: 'the reference adapter signs its cursors with this' },
});

/**
 * What `checkRules` reports (SPEC 10.3): per case, the fixtures it tried
 * and each one the declarations and the database disagree on, or why the
 * case could not run.
 * @packageDocumentation
 */

/** A fixture the declarations and the database disagree on. */
export interface RuleDisagreement {
  /** The fixture's label: `max+1`, `accept[0]`, `fixtures[2]`. */
  readonly label: string;
  /** The fixture as the declaration's schema saw it. */
  readonly value: unknown;
  /** How they disagree: `the schema accepts it; the database refuses it (23514 contacts_email_check)`. */
  readonly reason: string;
}

/** A case of `@nizam-os/resource-core`'s `oracleCases` and how it went. */
export interface RuleCaseReport {
  /** What the case tried: `contacts.email`, `meetings.during (codec range)`. */
  readonly subject: string;
  readonly kind: 'field' | 'relationship' | 'validator' | 'codec';
  /** How many fixtures the case holds. */
  readonly fixtures: number;
  /**
   * Why the case could not run, such as a CHECK the replayed database does
   * not hold; `null` when it ran.
   */
  readonly problem: string | null;
  readonly disagreements: ReadonlyArray<RuleDisagreement>;
}

export interface RulesReport {
  /** In the order `oracleCases` gives them. */
  readonly cases: ReadonlyArray<RuleCaseReport>;
  /** The tables `out.public.tables` lists that no declared resource reads. */
  readonly unusedTables: ReadonlyArray<string>;
}

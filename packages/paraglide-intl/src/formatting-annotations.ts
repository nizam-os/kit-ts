/**
 * The annotations a message formats with (SPEC 6.3, ADR 0008). Paraglide
 * compiles `number`, `datetime`, `relativetime`, and the ICU plugin's
 * `date`, `time`, and `icu:pound` (`#`) to registry calls that build an
 * `Intl` object from the message's bare locale code; `plural` selects a
 * variant and prints nothing. A finding is an expression of a pattern, or
 * a local declaration, annotated with one of them.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile-annotation.ts (registryFunctionByAnnotation)
 * @packageDocumentation
 */
import type { Bundle, Expression } from './bundle';

import { isExpression, isLocalVariable } from './bundle';

const FORMATTING_ANNOTATIONS: ReadonlySet<string> = new Set([
  'number',
  'datetime',
  'date',
  'time',
  'relativetime',
  'icu:pound',
]);

/** A value a message formats: the message, the locale, the variable, and the annotation. */
export interface FormattingFinding {
  /** The message's key. */
  readonly bundleId: string;
  /** The locale of the pattern; `undefined` for a declaration, which every locale shares. */
  readonly locale: string | undefined;
  /** The variable the expression reads or the declaration declares; `undefined` for a literal. */
  readonly variable: string | undefined;
  readonly annotation: string;
}

function formattingAnnotation(expression: Expression): string | undefined {
  const name = expression.annotation?.name;
  return name !== undefined && FORMATTING_ANNOTATIONS.has(name)
    ? name
    : undefined;
}

function declarationFindings(bundle: Bundle): Array<FormattingFinding> {
  return bundle.declarations.flatMap((declaration) => {
    const annotation = isLocalVariable(declaration)
      ? formattingAnnotation(declaration.value)
      : undefined;
    return annotation === undefined
      ? []
      : [
          {
            bundleId: bundle.id,
            locale: undefined,
            variable: declaration.name,
            annotation,
          },
        ];
  });
}

function patternFindings(bundle: Bundle): Array<FormattingFinding> {
  return bundle.messages.flatMap((message) =>
    message.variants
      .flatMap((variant) => variant.pattern)
      .filter((part): part is Expression => isExpression(part))
      .flatMap((expression) => {
        const annotation = formattingAnnotation(expression);
        return annotation === undefined
          ? []
          : [
              {
                bundleId: bundle.id,
                locale: message.locale,
                variable:
                  expression.arg.type === 'variable-reference'
                    ? expression.arg.name
                    : undefined,
                annotation,
              },
            ];
      }),
  );
}

/** Code-unit order, with `undefined` (every locale, a literal) first. */
function compareOptional(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined || (right !== undefined && left < right)) {
    return -1;
  }
  return 1;
}

/** The fields findings are ordered by, in order. */
const FINDING_ORDER: ReadonlyArray<
  (finding: FormattingFinding) => string | undefined
> = [
  (finding) => finding.bundleId,
  (finding) => finding.locale,
  (finding) => finding.variable,
  (finding) => finding.annotation,
];

function compareFindings(
  left: FormattingFinding,
  right: FormattingFinding,
): number {
  for (const field of FINDING_ORDER) {
    const order = compareOptional(field(left), field(right));
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

/** Every value the bundles format, each listed once, by bundle id, locale, and variable. */
export function formattingFindings(
  bundles: ReadonlyArray<Bundle>,
): ReadonlyArray<FormattingFinding> {
  const sorted = bundles
    .flatMap((bundle) => [
      ...declarationFindings(bundle),
      ...patternFindings(bundle),
    ])
    .toSorted(compareFindings);
  return sorted.filter((finding, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || compareFindings(previous, finding) !== 0;
  });
}

function findingLine(finding: FormattingFinding): string {
  return `${finding.bundleId} (${finding.locale ?? 'every locale'}): ${finding.variable ?? 'a literal'}: ${finding.annotation}`;
}

/**
 * Thrown by `compile()` when a message formats a value and `formatters` is
 * `'refuse'`, before anything is written. Carries every finding.
 */
export class MessageFormattingError extends Error {
  public readonly findings: ReadonlyArray<FormattingFinding>;

  public constructor(findings: ReadonlyArray<FormattingFinding>) {
    const count =
      findings.length === 1
        ? '1 value is formatted inside a message'
        : `${findings.length} values are formatted inside messages`;
    super(
      `compile: ${count}, with the engine's defaults; format each with @nizam-os/intl-core and interpolate the string, or pass formatters: 'allow'\n${findings
        .map((finding) => `  ${findingLine(finding)}`)
        .join('\n')}`,
    );
    this.name = 'MessageFormattingError';
    this.findings = Object.freeze([...findings]);
  }
}

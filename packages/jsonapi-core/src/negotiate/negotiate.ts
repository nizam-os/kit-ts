/**
 * Content negotiation (SPEC 3.3): the server responsibilities of the
 * specification as a pure function over the request's `Content-Type` and
 * `Accept` field values and the extensions and profiles an endpoint supports.
 * A detail quotes the request's text only when it is a plain token
 * (ADR 0016), so it never carries an extension URI.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-servers
 * @packageDocumentation
 */
import type { BanError } from '@nizam-os/ban-core';

import type { MediaRange, MediaType } from '../media-type/parse';

import { isBanError } from '@nizam-os/ban-core';

import { jsonApiError } from '../errors/json-api-error';
import { quotable } from '../internal/quotable';
import { isJsonApiMediaType, jsonApiParameters } from '../media-type/json-api';
import { parseAccept, parseMediaType } from '../media-type/parse';

export interface NegotiationHeaders {
  /** The `Content-Type` field value; `null` or `undefined` when absent. */
  readonly contentType?: string | null | undefined;
  /** The `Accept` field value; `null` or `undefined` when absent. */
  readonly accept?: string | null | undefined;
}

export interface NegotiationOptions {
  /** Extension URIs the endpoint supports. Default none. */
  readonly extensions?: ReadonlyArray<string> | undefined;
  /** Profile URIs the endpoint can apply when a client asks. Default none. */
  readonly profiles?: ReadonlyArray<string> | undefined;
}

/** What the request declared about its own body. */
export interface NegotiatedRequest {
  /** The parsed `Content-Type`, or `undefined` when absent or unparseable. */
  readonly mediaType: MediaType | undefined;
  /** `true` when the body is declared as the JSON:API media type. */
  readonly jsonApi: boolean;
  /** Extension URIs on the request's `Content-Type`; all are supported. */
  readonly extensions: ReadonlyArray<string>;
  /** Profile URIs on the request's `Content-Type`, as sent. */
  readonly profiles: ReadonlyArray<string>;
}

export interface NegotiationSuccess {
  readonly ok: true;
  readonly request: NegotiatedRequest;
  /** Extensions the response MUST apply: those of the chosen `Accept` instance. */
  readonly extensions: ReadonlyArray<string>;
  /** Profiles the client asked for that the endpoint supports, in request order. */
  readonly profiles: ReadonlyArray<string>;
}

export interface NegotiationFailure {
  readonly ok: false;
  /** A 415 or 406 `BanError` carrying `Vary: Accept`. */
  readonly error: BanError;
}

export type Negotiation = NegotiationSuccess | NegotiationFailure;

/**
 * Every negotiated response varies on `Accept`, the rejections included
 * (`#content-negotiation-servers`; RFC 9110 12.5.5).
 */
const VARY_ACCEPT = { Vary: 'Accept' };

function unsupportedMediaType(detail: string): BanError {
  return jsonApiError('UNSUPPORTED_MEDIA_TYPE', {
    detail,
    source: { header: 'Content-Type' },
    headers: VARY_ACCEPT,
  });
}

function notAcceptable(detail: string): BanError {
  return jsonApiError('NOT_ACCEPTABLE', {
    detail,
    source: { header: 'Accept' },
    headers: VARY_ACCEPT,
  });
}

const NO_REQUEST: NegotiatedRequest = {
  mediaType: undefined,
  jsonApi: false,
  extensions: [],
  profiles: [],
};

/** The detail for parameters other than `ext` and `profile`, naming them when every name is a plain token. */
function otherParameters(names: ReadonlyArray<string>): string {
  const refusal =
    'The JSON:API media type must not carry media type parameters other than ext and profile';
  return names.every((name) => quotable(name))
    ? `${refusal}; received ${names.map((name) => `"${name}"`).join(', ')}`
    : refusal;
}

/**
 * Checks the request `Content-Type`: 415 when the JSON:API media type carries
 * a parameter other than `ext` or `profile`, or an unsupported extension.
 */
function negotiateContentType(
  value: string | null | undefined,
  supported: ReadonlySet<string>,
): NegotiatedRequest | BanError {
  if (value == null) {
    return NO_REQUEST;
  }
  const mediaType = parseMediaType(value);
  if (mediaType === undefined) {
    return NO_REQUEST;
  }
  if (!isJsonApiMediaType(mediaType)) {
    return { ...NO_REQUEST, mediaType };
  }
  const parameters = jsonApiParameters(mediaType);
  if (parameters.other.length > 0) {
    return unsupportedMediaType(otherParameters(parameters.other));
  }
  if (parameters.ext.some((uri) => !supported.has(uri))) {
    return unsupportedMediaType(
      'The media type names an extension this endpoint does not support',
    );
  }
  return {
    mediaType,
    jsonApi: true,
    extensions: parameters.ext,
    profiles: parameters.profile,
  };
}

interface Instance {
  readonly range: MediaRange;
  readonly ext: ReadonlyArray<string>;
  readonly profile: ReadonlyArray<string>;
  readonly unsupported: boolean;
}

/**
 * The JSON:API instances of `Accept` that count: every instance of the media
 * type, minus those with a parameter other than `ext` or `profile` (which the
 * specification says to ignore) and minus `q=0` instances (which RFC 9110
 * defines as "not acceptable", so the client is not asking for them).
 */
function jsonApiInstances(
  ranges: ReadonlyArray<MediaRange>,
  supported: ReadonlySet<string>,
): { readonly all: number; readonly usable: Array<Instance> } {
  let all = 0;
  const usable: Array<Instance> = [];
  for (const range of ranges) {
    if (!isJsonApiMediaType(range) || range.weight === 0) {
      continue;
    }
    all += 1;
    const parameters = jsonApiParameters(range);
    if (parameters.other.length > 0) {
      continue;
    }
    usable.push({
      range,
      ext: parameters.ext,
      profile: parameters.profile,
      unsupported: parameters.ext.some((uri) => !supported.has(uri)),
    });
  }
  return { all, usable };
}

/**
 * Picks the instance to honor: highest weight first; among equals, the one
 * requiring the most extensions (the client asked for those semantics and the
 * endpoint can deliver them), then field order.
 */
function choose(candidates: ReadonlyArray<Instance>): Instance | undefined {
  let best: Instance | undefined;
  for (const candidate of candidates) {
    if (
      best === undefined ||
      candidate.range.weight > best.range.weight ||
      (candidate.range.weight === best.range.weight &&
        candidate.ext.length > best.ext.length)
    ) {
      best = candidate;
    }
  }
  return best;
}

function negotiateAccept(
  value: string | null | undefined,
  supportedExtensions: ReadonlySet<string>,
  supportedProfiles: ReadonlySet<string>,
):
  | { extensions: ReadonlyArray<string>; profiles: ReadonlyArray<string> }
  | BanError {
  if (value == null) {
    return { extensions: [], profiles: [] };
  }
  const { all, usable } = jsonApiInstances(
    parseAccept(value),
    supportedExtensions,
  );
  if (all === 0) {
    return { extensions: [], profiles: [] };
  }
  if (usable.length === 0) {
    return notAcceptable(
      'Every JSON:API media type in Accept carries a media type parameter other than ext and profile',
    );
  }
  const candidates = usable.filter((instance) => !instance.unsupported);
  if (candidates.length === 0) {
    return notAcceptable(
      'Every JSON:API media type in Accept requires an extension this endpoint does not support',
    );
  }
  const chosen = choose(candidates);
  return {
    extensions: chosen?.ext ?? [],
    // Unrecognized profiles MUST be ignored.
    profiles: (chosen?.profile ?? []).filter((uri) =>
      supportedProfiles.has(uri),
    ),
  };
}

/**
 * Applies the server responsibilities in order: `Content-Type` first (415),
 * then `Accept` (406). The result says what the request body is declared as
 * and which extensions and profiles the response has to apply.
 */
export function negotiate(
  headers: NegotiationHeaders,
  options: NegotiationOptions = {},
): Negotiation {
  const supportedExtensions = new Set(options.extensions ?? []);
  const supportedProfiles = new Set(options.profiles ?? []);
  const request = negotiateContentType(
    headers.contentType,
    supportedExtensions,
  );
  if (isBanError(request)) {
    return { ok: false, error: request };
  }
  const accepted = negotiateAccept(
    headers.accept,
    supportedExtensions,
    supportedProfiles,
  );
  if (isBanError(accepted)) {
    return { ok: false, error: accepted };
  }
  return {
    ok: true,
    request,
    extensions: accepted.extensions,
    profiles: accepted.profiles,
  };
}

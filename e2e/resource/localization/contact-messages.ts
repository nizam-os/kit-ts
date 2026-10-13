/**
 * The contacts application's messages (resource SPEC 10.1): every one a
 * Paraglide message function, compiled from `messages/{locale}.json`, and
 * each referenced directly so the bundler can tree-shake and `inlang check`
 * can see which are used. `defineMessages` holds the mapping to the
 * registry: a code, constraint kind, issue kind, member, or option without
 * its message fails `tsc`, and so does a message whose variables, in any
 * locale, are not the ones its kind receives.
 * @ref https://paraglidejs.com/basics#dynamic-messages
 */
import type { MessagesFor } from '@nizam-os/resource-core';

import { defineMessages } from '@nizam-os/resource-core';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { m } from './paraglide/messages.js';

export const RESOURCES = [Organizations, Contacts] as const;

export const contactMessages: MessagesFor<typeof RESOURCES> = defineMessages(
  RESOURCES,
  {},
  {
    errors: {
      INVALID_QUERY_PARAMETER: {
        title: m.error_invalid_query_parameter_title,
        detail: m.error_invalid_query_parameter_detail,
      },
      UNKNOWN_QUERY_PARAMETER: {
        title: m.error_unknown_query_parameter_title,
        detail: m.error_unknown_query_parameter_detail,
      },
      INVALID_DOCUMENT: {
        title: m.error_invalid_document_title,
        detail: m.error_invalid_document_detail,
      },
      MALFORMED_JSON: {
        title: m.error_malformed_json_title,
        detail: m.error_malformed_json_detail,
      },
      UNSUPPORTED_SORT: {
        title: m.error_unsupported_sort_title,
        detail: m.error_unsupported_sort_detail,
      },
      MAX_PAGE_SIZE_EXCEEDED: {
        title: m.error_max_page_size_exceeded_title,
        detail: m.error_max_page_size_exceeded_detail,
      },
      RANGE_PAGINATION_NOT_SUPPORTED: {
        title: m.error_range_pagination_not_supported_title,
        detail: m.error_range_pagination_not_supported_detail,
      },
      FORBIDDEN: {
        title: m.error_forbidden_title,
        detail: m.error_forbidden_detail,
      },
      // A built-in of @nizam-os/ban-core that the actor resolver throws. Its
      // entry is optional; without one, a 401 keeps its English text.
      UNAUTHORIZED: {
        title: m.error_unauthorized_title,
        detail: m.error_unauthorized_detail,
      },
      CLIENT_GENERATED_ID_NOT_SUPPORTED: {
        title: m.error_client_generated_id_not_supported_title,
        detail: m.error_client_generated_id_not_supported_detail,
      },
      NOT_FOUND: {
        title: m.error_not_found_title,
        detail: m.error_not_found_detail,
      },
      METHOD_NOT_ALLOWED: {
        title: m.error_method_not_allowed_title,
        detail: m.error_method_not_allowed_detail,
      },
      NOT_ACCEPTABLE: {
        title: m.error_not_acceptable_title,
        detail: m.error_not_acceptable_detail,
      },
      CONFLICT: {
        title: m.error_conflict_title,
        detail: m.error_conflict_detail,
      },
      UNSUPPORTED_MEDIA_TYPE: {
        title: m.error_unsupported_media_type_title,
        detail: m.error_unsupported_media_type_detail,
      },
      VALIDATION_FAILED: {
        title: m.error_validation_failed_title,
        detail: m.error_validation_failed_detail,
      },
      INTERNAL_SERVER_ERROR: {
        title: m.error_internal_server_error_title,
        detail: m.error_internal_server_error_detail,
      },
      QUOTA_EXCEEDED: {
        title: m.error_quota_exceeded_title,
        detail: m.error_quota_exceeded_detail,
      },
      CONTACT_EMAIL_TAKEN: {
        title: m.error_contact_email_taken_title,
        detail: m.error_contact_email_taken_detail,
      },
    },
    constraints: {
      check: {
        title: m.constraint_check_title,
        detail: m.constraint_check_detail,
      },
      notNull: {
        title: m.constraint_not_null_title,
        detail: m.constraint_not_null_detail,
      },
      unique: {
        title: m.constraint_unique_title,
        detail: m.constraint_unique_detail,
      },
    },
    validation: {
      required: m.validation_required,
      type: m.validation_type,
      format: m.validation_format,
      minLength: m.validation_min_length,
      maxLength: m.validation_max_length,
      minimum: m.validation_minimum,
      maximum: m.validation_maximum,
      exclusiveMinimum: m.validation_exclusive_minimum,
      exclusiveMaximum: m.validation_exclusive_maximum,
      multipleOf: m.validation_multiple_of,
      enum: m.validation_enum,
      pattern: m.validation_pattern,
      additionalProperties: m.validation_additional_properties,
    },
    fields: {
      organizations: {
        name: m.field_organizations_name,
        slug: m.field_organizations_slug,
        handle: m.field_organizations_handle,
        seats: m.field_organizations_seats,
        country: m.field_organizations_country,
        createdAt: m.field_organizations_created_at,
      },
      contacts: {
        kind: m.field_contacts_kind,
        name: m.field_contacts_name,
        nickname: m.field_contacts_nickname,
        email: m.field_contacts_email,
        website: m.field_contacts_website,
        status: m.field_contacts_status,
        priority: m.field_contacts_priority,
        discount: m.field_contacts_discount,
        tags: m.field_contacts_tags,
        createdAt: m.field_contacts_created_at,
        organization: m.field_contacts_organization,
      },
    },
    options: {
      contacts: {
        kind: {
          person: m.option_contacts_kind_person,
          company: m.option_contacts_kind_company,
        },
        status: {
          active: m.option_contacts_status_active,
          archived: m.option_contacts_status_archived,
        },
      },
    },
  },
);

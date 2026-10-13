/**
 * `@nizam-os/resource-ui`: forms, lists, and record and bulk actions from
 * `@nizam-os/resource-core` declarations, as models of a declared resource
 * that import no framework and nothing of TanStack, so a screen on any
 * framework reads them (ADR 0018, ADR 0019). See `docs/resource/SPEC.md`,
 * sections 20 and 21, for the contract.
 * @packageDocumentation
 */
export type { ActionCall } from './actions/action-calls';
export type {
  ActionConfirm,
  ActionCount,
  ActionRecord,
  ActionResource,
  ActionState,
  ActionTone,
  ActionValues,
  BulkAction,
  BulkActionInit,
  BulkActions,
  BulkActionsOptions,
  RecordAction,
  RecordActionInit,
  RecordActions,
  RecordActionsOptions,
  SelectionErrors,
} from './actions/action-types';
export type { FilterKind } from './fields/filter-kind';
export type {
  FormErrors,
  FormMemberName,
  FormModel,
  FormModelOptions,
  FormOperation,
  FormRecord,
  FormValue,
  FormValues,
  FormWriteOf,
} from './form/form-types';
export type { FormResource } from './form/resource-form';
export type {
  ListColumnFilters,
  ListModel,
  ListResource,
  ListSorting,
  ListState,
} from './list/list-types';
export type {
  ColumnFilterDescriptor,
  FieldDescriptor,
  FieldDescriptors,
  FieldOption,
} from './fields/fields-of';

export { bulkActions } from './actions/bulk-actions';
export { recordActions } from './actions/record-actions';
export { fieldsOf } from './fields/fields-of';
export { resourceForm } from './form/resource-form';
export { resourceList } from './list/resource-list';

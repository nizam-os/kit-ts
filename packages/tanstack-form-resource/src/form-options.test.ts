import { beforeEach, describe, expect, it } from 'vitest';

import { resourceForm } from '@nizam-os/resource-ui';

import { resourceFormOptions } from './form-options';
import { mountForm, shown } from './test-support/forms';
import { messages, setLocale } from './test-support/messages';
import { Tasks } from './test-support/resources';

const create = resourceForm(Tasks, 'create', {
  messages,
  members: ['title', 'points', 'workspace'],
});

/** A JavaScript caller's argument, which the types would refuse. */
const untyped = resourceFormOptions as (model: unknown) => unknown;

beforeEach(() => {
  setLocale('de');
});

describe('resourceFormOptions (resource SPEC 20.5)', () => {
  it("gives a form the model's values to start from, and its validator under revalidateLogic", () => {
    const options = resourceFormOptions(create);
    expect(Object.keys(options)).toEqual([
      'defaultValues',
      'validationLogic',
      'validators',
    ]);
    expect(options.defaultValues).toBe(create.defaultValues);
    expect(options.validators).toEqual({ onDynamic: create.validator });
    expect(options.validationLogic).toBeTypeOf('function');
  });

  it('shows no error before the form is first submitted', () => {
    const { form, field } = mountForm(create);
    field('points').handleChange('viele');
    field('points').handleBlur();
    field('title').handleChange('Plan');
    field('title').handleChange('');
    field('title').handleBlur();
    expect(shown(field('points'))).toEqual([]);
    expect(shown(field('title'))).toEqual([]);
    expect(form.state.canSubmit).toBe(true);
  });

  it("refuses the first submit with the declaration's issues, each on its field, in the locale of the moment", async () => {
    const { form, field, submitted } = mountForm(create);
    field('points').handleChange('viele');
    await form.handleSubmit();
    expect(submitted).toEqual([]);
    expect(shown(field('title'))).toEqual(['Titel fehlt.']);
    expect(shown(field('points'))).toEqual(['Kein gültiges Format: int64.']);
    expect(shown(field('workspace'))).toEqual(['Arbeitsbereich fehlt.']);
    expect(form.state.isSubmitSuccessful).toBe(false);
  });

  it('validates on every change after the first submit', async () => {
    const { form, field } = mountForm(create);
    await form.handleSubmit();
    field('title').handleChange('Plan');
    expect(shown(field('title'))).toEqual([]);
    expect(shown(field('workspace'))).toEqual(['Arbeitsbereich fehlt.']);
    setLocale('en');
    field('points').handleChange('many');
    expect(shown(field('points'))).toEqual(['Not a valid int64.']);
    expect(shown(field('workspace'))).toEqual(['Workspace is missing.']);
    field('points').handleChange('3');
    expect(shown(field('points'))).toEqual([]);
  });

  it('hands the values of a submit the validator accepts to the handler, and they make the write', async () => {
    const { form, field, submitted } = mountForm(create);
    field('title').handleChange('Plan the launch');
    field('workspace').handleChange('1');
    await form.handleSubmit();
    expect(submitted).toEqual([
      { title: 'Plan the launch', points: '', workspace: '1' },
    ]);
    expect(create.write(submitted[0] ?? {})).toEqual({
      attributes: { title: 'Plan the launch' },
      relationships: { workspace: { type: 'workspaces', id: '1' } },
    });
    expect(form.state.isSubmitSuccessful).toBe(true);
  });

  it.each([
    ['the resource', Tasks],
    ['undefined', undefined],
    ['its values alone', { defaultValues: create.defaultValues }],
  ])('refuses %s as the model', (_, model) => {
    expect(() => untyped(model)).toThrow(
      new TypeError(
        'resourceFormOptions: model must be what a resourceForm returned',
      ),
    );
  });
});

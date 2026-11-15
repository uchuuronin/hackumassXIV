// The "Who helps you" form: forgiving of an address typed into the wrong box.
import { expect, test } from '@playwright/test';
import { tidyHelper } from '../src/shared/family';

test('filled in as asked: saved as it is', () => {
  expect(tidyHelper({ name: ' Maya ', email: 'maya@example.com', relation: 'My Daughter' })).toEqual({ ok: true, helper: { name: 'Maya', email: 'maya@example.com', relation: 'daughter' }, moved: false });
  expect(tidyHelper({ name: 'Maya', email: 'maya@example.com', relation: '' })).toEqual({ ok: true, helper: { name: 'Maya', email: 'maya@example.com' }, moved: false });
});

test('first name, last name, then the address in the third box: put right, and said so', () => {
  expect(tidyHelper({ name: 'Another', email: 'Person', relation: 'someone@example.com' })).toEqual({ ok: true, helper: { name: 'Another Person', email: 'someone@example.com' }, moved: true });
});

test('the address typed into the name box, or the two swapped: put right', () => {
  expect(tidyHelper({ name: 'maya@example.com', email: 'Maya', relation: '' })).toEqual({ ok: true, helper: { name: 'Maya', email: 'maya@example.com' }, moved: true });
});

test('no address anywhere, or no name: says plainly what is missing', () => {
  expect(tidyHelper({ name: 'Maya', email: 'maya at example', relation: '' })).toEqual({ ok: false, said: 'I need their email address in the second box. It looks like name@example.com.' });
  expect(tidyHelper({ name: '', email: 'maya@example.com', relation: '' })).toEqual({ ok: false, said: 'Please type their first name in the first box.' });
});

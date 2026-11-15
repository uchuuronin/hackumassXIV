// Passing a task to another computer with three everyday words. The words are typed by a person,
// perhaps one hearing them over the telephone, so reading them has to be forgiving.
import { expect, test } from '@playwright/test';
import { WORDS as RELAY_WORDS } from '../relay/src/shareWords';
import { makeCode, memoryStore, tidyCode, tidyTask } from '../relay/src/taskShare';
import { checkTask } from '../src/shared/tasks';
import { readWords, WORDS } from '../src/shared/sharewords';

const STEP = {
  type: 'click',
  say: 'Click "Next".',
  locator: { kind: 'button', label: 'Next', labelConfident: true, protection: 'none', sendsForm: false, region: 'main', attrs: { id: 'next' } },
  page: { origin: 'https://clinic.example', path: '/book', stage: 'other' },
};
const TASK = { version: 1, id: 'abc123', name: "Book a doctor's appointment", site: 'https://clinic.example', recordedAt: 1794700000000, steps: [STEP] };

test('the extension and the relay have the same words, and none is said twice', () => {
  expect([...WORDS]).toEqual([...RELAY_WORDS]);
  expect(new Set(WORDS).size).toBe(WORDS.length);
  expect(WORDS.every((w) => /^[a-z]{3,7}$/.test(w))).toBe(true);
});

test('reads three words however they were typed', () => {
  for (const typed of ['garden kettle tulip', 'Garden, Kettle, Tulip', '  garden  and kettle and tulip. ', 'GARDEN-KETTLE-TULIP']) {
    expect(readWords(typed)).toEqual({ ok: true, words: ['garden', 'kettle', 'tulip'], fixed: [] });
  }
});

test('forgives a small slip in the spelling, and says which word it took it to be', () => {
  expect(readWords('gardin kettel tulip')).toEqual({ ok: true, words: ['garden', 'kettle', 'tulip'], fixed: ['garden', 'kettle'] });
});

test('says plainly what is wrong when it cannot read them', () => {
  expect(readWords('garden kettle')).toEqual({ ok: false, said: 'I need three words, and I can see 2. They look like this: garden kettle tulip.' });
  expect(readWords('')).toEqual({ ok: false, said: "I need three words, and I can't see any yet. They look like this: garden kettle tulip." });
  expect(readWords('garden kettle zzzzzz')).toEqual({ ok: false, said: 'I don\'t know the word "zzzzzz". Could you check that one with the person who gave it to you?' });
});

test('the relay makes three different words, and keeps a task for the right code only', async () => {
  let n = 0;
  const code = makeCode((max) => (n += 37) % max);
  expect(code.split(' ')).toHaveLength(3);
  expect(new Set(code.split(' ')).size).toBe(3);
  expect(readWords(code).ok).toBe(true);
  const store = memoryStore();
  await store.put(code, TASK);
  expect(await store.get(code)).toEqual(TASK);
  expect(await store.get('apple river lemon')).toBeNull();
});

test('the relay refuses anything that is not a small, plain task', () => {
  expect(tidyTask(TASK)).toEqual(TASK);
  expect(tidyTask(null)).toBeNull();
  expect(tidyTask({ ...TASK, steps: [] })).toBeNull();
  expect(tidyTask({ ...TASK, steps: Array.from({ length: 200 }, () => STEP) })).toBeNull();
  expect(tidyTask({ ...TASK, name: 'x'.repeat(100_000) })).toBeNull();
});

test('a task that arrives is rebuilt from the parts Milo knows, and marked as from another computer', () => {
  const arrived = checkTask({ ...TASK, extra: 'ignored', steps: [{ ...STEP, value: 'never kept', locator: { ...STEP.locator, typed: '4111 1111' } }] })!;
  expect(arrived.name).toBe("Book a doctor's appointment");
  expect(arrived.shared?.at).toBeGreaterThan(0);
  expect(JSON.stringify(arrived)).not.toMatch(/ignored|never kept|4111/);
  expect(arrived.steps[0]!.locator.protection).toBe('none');
});

test('a task that arrives broken, or pointing somewhere that is not a website, is refused', () => {
  expect(checkTask({ ...TASK, steps: [{ ...STEP, type: 'run' }] })).toBeNull();
  expect(checkTask({ ...TASK, steps: [{ ...STEP, page: { ...STEP.page, origin: 'javascript:alert(1)' } }] })).toBeNull();
  expect(checkTask({ ...TASK, name: '' })).toBeNull();
  expect(checkTask('garden kettle tulip')).toBeNull();
});

test('the relay refuses anything that is not three short words on the list', () => {
  expect(tidyCode(undefined)).toBeNull();
  expect(tidyCode({ $ne: '' })).toBeNull();
  expect(tidyCode('garden kettle tulip '.repeat(20))).toBeNull();
  expect(tidyCode('Garden, kettle, TULIP')).toBe('garden kettle tulip');
});

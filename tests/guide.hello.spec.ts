// The hello to a newly added helper: once per address, never for the same person twice.
import { expect, test } from '@playwright/test';
import { sayHello } from '../src/guide/family/hello';

const memory = () => {
  const kept = new Map<string, unknown>();
  return { get: async <T,>(k: string) => kept.get(k) as T | undefined, set: async (k: string, v: unknown) => void kept.set(k, v), remove: async (k: string) => void kept.delete(k) };
};

test('sends once for a new helper, not again for the same address, again for a new one', async () => {
  const store = memory();
  await store.set('guide:details', { givenName: 'Rose' });
  const sent: unknown[] = [];
  const send = async (note: unknown) => (sent.push(note), true);
  expect(await sayHello({ name: 'Maya', email: 'maya@example.com' }, store, send)).toBe(true);
  expect(sent[0]).toEqual({ type: 'helper/hello', note: { to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' } });
  expect(await sayHello({ name: 'Maya', email: ' MAYA@example.com ' }, store, send)).toBe(false);
  expect(sent).toHaveLength(1);
  await sayHello({ name: 'Sam', email: 'sam@example.com' }, store, send);
  expect(sent).toHaveLength(2);
});

test('if the relay could not send it, it tries again next time', async () => {
  const store = memory();
  let ok = false;
  const send = async () => ok;
  expect(await sayHello({ name: 'Maya', email: 'maya@example.com' }, store, send)).toBe(false);
  ok = true;
  expect(await sayHello({ name: 'Maya', email: 'maya@example.com' }, store, send)).toBe(true);
});

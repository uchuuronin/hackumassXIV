// What the extension sends to the relay. An older relay ignores what it doesn't know, so a new
// extension keeps working before the relay is restarted.
import { expect, test } from '@playwright/test';
import { askRelay } from '../src/helper/relay';

async function sent(run: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const real = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
    return new Response(JSON.stringify({ text: '{"said":"ok"}' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
  return body;
}

test('a plain question sends only the prompt, exactly as before', async () => {
  expect(await sent(() => askRelay('hello'))).toEqual({ prompt: 'hello' });
});

test('a search and a JSON answer are each asked for by one extra word', async () => {
  expect(await sent(() => askRelay('hello', true))).toEqual({ prompt: 'hello', search: true });
  expect(await sent(() => askRelay('hello', false, true))).toEqual({ prompt: 'hello', json: true });
});

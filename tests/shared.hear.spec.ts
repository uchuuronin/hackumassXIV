// Listening to her. The bug: with the microphone allowed, pressing "Talk to me" did nothing, because
// Milo waited for Chrome to download its on-device speech model before listening, and that can take
// minutes or never finish. Now it listens at once, and only uses the on-device model when it is ready.
import { expect, test, type Page } from '@playwright/test';
import { html } from './helpers';

/** A pretend speech recogniser. `state` is what Chrome says about the on-device model. */
async function fake(page: Page, state: 'available' | 'downloadable' | 'unavailable' | 'hang', script: Array<[number, string | { error: string } | 'end']>) {
  await page.evaluate(([state, script]) => {
    const log: string[] = [];
    (window as unknown as { log: string[] }).log = log;
    class SR {
      lang = '';
      processLocally = false;
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      static available() {
        log.push('available?');
        return state === 'hang' ? new Promise(() => undefined) : Promise.resolve(state);
      }
      static install() {
        log.push('install');
        return new Promise(() => undefined); // a download that never finishes
      }
      start() {
        log.push(`start local=${this.processLocally}`);
        this.onstart?.();
        let words = '';
        for (const [at, what] of script as Array<[number, unknown]>) {
          setTimeout(() => {
            if (what === 'end') return this.onend?.();
            if (typeof what === 'object') return this.onerror?.(what);
            words = String(what);
            this.onresult?.({ results: [[{ transcript: words }]] });
          }, at);
        }
      }
      stop() {
        log.push('stop');
        setTimeout(() => this.onend?.(), 5);
      }
    }
    (window as unknown as { SR: unknown }).SR = SR;
  }, [state, script] as const);
}

async function listen(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ events: string[]; ms: number }>((resolve) => {
        const events: string[] = [];
        const t0 = performance.now();
        const done = () => resolve({ events, ms: Math.round(performance.now() - t0) });
        window.__steady.hear.listen((window as unknown as { SR: never }).SR, {
          quietMs: 300,
          onStart: () => events.push(`start@${Math.round(performance.now() - t0) < 1000 ? 'soon' : 'late'}`),
          onWords: (w) => events.push(`words:${w}`),
          onDone: (w) => {
            events.push(`done:${w}`);
            done();
          },
          onError: (code) => {
            events.push(`error:${code}`);
            done();
          },
        });
        setTimeout(done, 4000);
      }),
  );
}

test("it listens at once even when Chrome's on-device model is still downloading, and doesn't wait for the download", async ({ page }) => {
  await html(page, '<main></main>');
  await fake(page, 'downloadable', [[100, 'what do I click'], [400, 'end']]);
  const got = await listen(page);
  expect(got.events[0]).toBe('start@soon');
  expect(got.events).toContain('done:what do I click');
  const log = await page.evaluate(() => (window as unknown as { log: string[] }).log);
  expect(log).toContain('install'); // asked for, for next time
  expect(log).toContain('start local=false'); // but not waited for: Chrome's ordinary recogniser is used now
});

test('it uses the on-device model when it is ready', async ({ page }) => {
  await html(page, '<main></main>');
  await fake(page, 'available', [[100, 'hello'], [400, 'end']]);
  await listen(page);
  expect(await page.evaluate(() => (window as unknown as { log: string[] }).log)).toContain('start local=true');
});

test('a Chrome that never answers about the on-device model still gets to listen', async ({ page }) => {
  await html(page, '<main></main>');
  await fake(page, 'hang', [[100, 'hello'], [400, 'end']]);
  const got = await listen(page);
  expect(got.events[0]).toBe('start@soon');
  expect(got.events).toContain('done:hello');
});

test('the words appear as she speaks, and are sent once she pauses', async ({ page }) => {
  await html(page, '<main></main>');
  await fake(page, 'unavailable', [[100, 'book a'], [200, 'book a flu shot']]);
  const got = await listen(page);
  expect(got.events.filter((e) => e.startsWith('words:'))).toEqual(['words:book a', 'words:book a flu shot']);
  expect(got.events[got.events.length - 1]).toBe('done:book a flu shot');
});

test('silence, or a microphone problem, is reported instead of nothing happening', async ({ page }) => {
  await html(page, '<main></main>');
  await fake(page, 'unavailable', [[150, 'end']]);
  expect((await listen(page)).events).toContain('error:no-speech');
  await fake(page, 'unavailable', [[100, { error: 'not-allowed' }], [120, 'end']]);
  const blocked = (await listen(page)).events;
  expect(blocked).toContain('error:not-allowed');
  expect(blocked.filter((e) => e.startsWith('error')).length).toBe(1); // said once, not twice
});

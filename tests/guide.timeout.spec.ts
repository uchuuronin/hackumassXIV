// Feature 8, the timeout warning. Some websites quietly count down and then clear the page.
// A slow, careful person is exactly who gets caught. Milo notices, says so calmly, and shows the way to more time.
import { expect, test, type Page } from '@playwright/test';
import { html, inject } from './helpers';

const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => ({ said: String(c.args[0]), options: c.args[1] })));
const BAR = (time: string) => `<div role="status" class="session-bar">For your security, this page will reset in <span>${time}</span>. <a href="#" id="stay" onclick="window.stayed=(window.stayed||0)+1;return false">Stay on this page</a></div>`;
const FORM = `<form><label>Email <input type="email" name="email"></label><button>Next</button></form>`;

test('a countdown with a way to stop it: says what it means and offers to press the button', async ({ page }) => {
  await html(page, BAR('0:45') + FORM);
  const state = await page.evaluate(() => window.__steady.timeout.check());
  expect(state).toEqual({
    status: 'warning',
    said: 'This page says it will reset in less than a minute. Nothing\'s lost yet. The link "Stay on this page" gives you more time. Want me to click it for you?',
    options: ['Yes, keep my place', 'I\'ll click it'],
  });
  expect(await page.evaluate(() => (window as never as { stayed?: number }).stayed)).toBeUndefined(); // nothing pressed yet
  const lit = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight' && c.args[0]).at(-1)!.args[0] as { targetId: string; dim?: boolean });
  expect(await page.evaluate((id) => window.__steady.api.elementFor(id)?.id, lit.targetId)).toBe('stay');
});

test('"Yes, keep my place": presses the button once, and says so', async ({ page }) => {
  await html(page, BAR('1:30') + FORM);
  await page.evaluate(() => window.__steady.timeout.check());
  const done = await page.evaluate(() => window.__steady.timeout.keepPlace());
  expect(done).toEqual({ status: 'kept', said: 'Done. You\'ve got more time now, so no need to hurry.' });
  expect(await page.evaluate(() => (window as never as { stayed?: number }).stayed)).toBe(1);
});

test('says how long is left in plain words', async ({ page }) => {
  for (const [shown, plain] of [['4:10', 'about 4 minutes'], ['1:05', 'about a minute'], ['90 seconds', 'about a minute'], ['2 minutes', 'about 2 minutes'], ['0:20', 'less than a minute']] as const) {
    await html(page, BAR(shown) + FORM);
    expect((await page.evaluate(() => window.__steady.timeout.check())).said).toContain(`will reset in ${plain}.`);
  }
});

test('no way to ask for more time: says so honestly, and takes the blame off her', async ({ page }) => {
  await html(page, `<div role="alert">Your session will expire in 2 minutes due to inactivity.</div>` + FORM);
  expect(await page.evaluate(() => window.__steady.timeout.check())).toEqual({
    status: 'warning',
    said: 'This page says it will sign you out in about 2 minutes. I can\'t see a button that asks for more time. If it does sign you out, that\'s the website, not you, and we can do it again together.',
  });
});

test('watching: speaks once when the warning appears, not on every tick of the countdown', async ({ page }) => {
  await html(page, FORM);
  await page.evaluate(() => window.__steady.timeout.watch());
  await page.waitForTimeout(100);
  expect(await spoken(page)).toEqual([]);
  await page.evaluate((bar) => document.body.insertAdjacentHTML('afterbegin', bar), BAR('0:59'));
  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  for (const t of ['0:58', '0:57', '0:56']) {
    await page.evaluate((time) => (document.querySelector('.session-bar span')!.textContent = time), t);
    await page.waitForTimeout(350);
  }
  expect((await spoken(page)).length).toBe(1);
  expect((await spoken(page))[0]!.options).toEqual(['Yes, keep my place', 'I\'ll click it']);
});

test('the page has already reset: says it was the website, and offers to do it again together', async ({ page }) => {
  await html(page, `<div role="status" class="session-bar">Your session ended and the form was cleared. Please start again.</div>` + FORM);
  expect(await page.evaluate(() => window.__steady.timeout.check())).toEqual({
    status: 'ended',
    said: 'The page has reset itself and cleared what was typed. That was the website, not you. We can fill it in again together.',
    options: ['Help me fill this in'],
  });
});

test('ordinary words about time on a page are not a warning', async ({ page }) => {
  await html(page, `<article><p>Our morning session will end in 5 minutes of gentle stretching.</p><p role="status">3 items in your basket</p></article>` + FORM);
  expect(await page.evaluate(() => window.__steady.timeout.check())).toEqual({ status: 'none', said: '' });
});

test('on the demo shop: the real countdown bar is noticed', async ({ page }) => {
  await page.goto('/shop/checkout.html?reset=1&timeout=6');
  await inject(page);
  await page.evaluate(() => window.__steady.timeout.watch());
  await expect.poll(async () => (await spoken(page))[0]?.said, { timeout: 8000 }).toContain('This page says it will reset in less than a minute.');
});

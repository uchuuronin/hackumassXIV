// Feature 5, "Spotlight": during a guided step the rest of the page is dimmed.
import { expect, test, type Page } from '@playwright/test';
import { html, inject, one } from './helpers';

const overlayCalls = (page: Page) =>
  page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight').map((c) => c.args[0]));

test('brings the step into view, lights it, and marks it as the current step', async ({ page }) => {
  const map = await html(page, `<div style="height:2500px"></div><button>Far below</button><div style="height:2500px"></div>`);
  const id = one(map, 'Far below').id;
  const result = await page.evaluate((i) => window.__steady.spotlight.on(i, 'Click this to go on.'), id);
  expect(result).toEqual({ ok: true });
  expect(await overlayCalls(page)).toEqual([{ targetId: id, text: 'Click this to go on.' }]);
  const after = one(await page.evaluate(() => window.__steady.api.get()), 'Far below');
  expect(after.inViewport).toBe(true);
  expect(after.marks.map((m) => m.kind)).toEqual(['current-step']);
});

test('turning it off clears the light and the mark', async ({ page }) => {
  const map = await html(page, `<button>Here</button>`);
  const id = one(map, 'Here').id;
  await page.evaluate((i) => window.__steady.spotlight.on(i), id);
  await page.evaluate(() => window.__steady.spotlight.off());
  expect((await overlayCalls(page)).at(-1)).toBeNull();
  expect(one(await page.evaluate(() => window.__steady.api.get()), 'Here').marks).toEqual([]);
});

for (const [setting, expected] of [
  ['no-preference', 'smooth'],
  ['reduce', 'auto'],
] as const) {
  test(`nothing moves suddenly: scrolling is ${expected} when the computer's motion setting is "${setting}"`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: setting });
    const spy = `window.__scrolls = []; Element.prototype.scrollIntoView = function (o) { window.__scrolls.push(o.behavior); window.scrollTo(0, 2400); };`;
    const map = await html(page, `<div style="height:2500px"></div><button>Far below</button><div style="height:2500px"></div><script>${spy}</script>`);
    await page.evaluate((i) => window.__steady.spotlight.on(i), one(map, 'Far below').id);
    expect(await page.evaluate(() => (window as unknown as { __scrolls: string[] }).__scrolls)).toEqual([expected]);
  });
}

test('a button that has gone: says so plainly and lights nothing', async ({ page }) => {
  const map = await html(page, `<button id="b">Was here</button>`);
  const id = one(map, 'Was here').id;
  await page.evaluate(() => document.getElementById('b')!.remove());
  const result = await page.evaluate((i) => window.__steady.spotlight.on(i), id);
  expect(result).toEqual({ ok: false, said: 'I can\'t find that on this page any more. The page may have changed. You can press "I\'m stuck" and we\'ll ask for help.' });
  expect(await overlayCalls(page)).toEqual([]);
});

test('a button hidden behind a pop-up: names what is in the way', async ({ page }) => {
  const map = await html(
    page,
    `<button style="position:absolute;left:300px;top:300px">Underneath</button>
     <div role="dialog" aria-modal="true" aria-label="Sign up for offers" style="position:fixed;inset:0;background:#0008"><button>×</button></div>`,
  );
  const result = await page.evaluate((i) => window.__steady.spotlight.on(i), one(map, 'Underneath').id);
  expect(result).toEqual({ ok: false, said: 'A box called "Sign up for offers" is in the way of "Underneath". Close that box first, then ask me again.' });
});

test('if the lit button disappears, the light goes out by itself', async ({ page }) => {
  const map = await html(page, `<button id="b">Here</button>`);
  await page.evaluate((i) => window.__steady.spotlight.on(i), one(map, 'Here').id);
  await page.evaluate(() => document.getElementById('b')!.remove());
  await expect.poll(async () => (await overlayCalls(page)).at(-1)).toBeNull();
});

test("when Steady's own big chooser opens over the lit box, the light and the dimming step aside, and come back after", async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  const id = await page.evaluate(() => window.__steady.api.get().elements.find((e) => e.label === 'Reason for your visit')!.id);
  await page.evaluate((i) => window.__steady.spotlight.on(i, 'Choose whichever suits you.'), id);
  const last = () => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight').at(-1)!.args[0] as { targetId: string } | null);
  expect((await last())?.targetId).toBe(id);

  // A's Big Pick: a large panel of Steady's own, on top of the little list.
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.id = 'big-pick';
    panel.setAttribute('data-steady-ui', '');
    panel.style.cssText = 'position:fixed;inset:10% 10% 10% 10%;background:#fff;z-index:2147483000;';
    document.documentElement.append(panel);
  });
  await expect.poll(last).toBeNull(); // nothing lit, nothing dimmed: the chooser is what she should see
  expect(await page.evaluate(() => window.__steady.spotlight.lit())).toBe(id); // the step itself is still on

  await page.evaluate(() => document.getElementById('big-pick')!.remove());
  await expect.poll(async () => (await last())?.targetId).toBe(id);
  await page.evaluate(() => window.__steady.spotlight.off());
  await page.waitForTimeout(500);
  expect(await last()).toBeNull(); // and off stays off
});

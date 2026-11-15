// The guide's own switches: each one turns off something Steady does without being asked, and nothing else.
import { expect, test, type Page } from '@playwright/test';
import { inject } from './helpers';
import { ALL_ON, LIGHT, readSwitches } from '../src/shared/guideSwitches';

const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => String(c.args[0])));
const set = (page: Page, switches: Record<string, boolean>) => page.evaluate((s) => window.__steady.store.set('guide:switches', s), switches);
async function clinic(page: Page, switches: Record<string, boolean> = {}) {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await set(page, switches);
}

test('everything is on unless she has turned it off, and "Keep it light" only quietens Steady', () => {
  expect(readSwitches(undefined)).toEqual(ALL_ON);
  expect(readSwitches({ walk: false, nonsense: true, trail: 'no' })).toEqual({ ...ALL_ON, walk: false });
  expect(LIGHT).toEqual({ walk: false, hints: false, nudges: false, calm: true, trail: true, lastTime: true, timeout: true, motion: true });
});

test('"Go through pages with me" off: "What do I click?" only says what the buttons do', async ({ page }) => {
  await clinic(page, { walk: false });
  const reply = await page.evaluate(() => window.__steady.answer('What do I click?'));
  expect(reply.said).toContain('Before "Next", there are two things to choose on this page');
  expect(reply.options).toBeUndefined();
  expect(await page.evaluate(() => window.__steady.walk.isActive())).toBe(false);
});

test('"Suggest things as I browse" off: nothing is offered when a page opens', async ({ page }) => {
  await page.goto('/shop/basket.html?reset=1');
  await inject(page);
  expect((await page.evaluate(() => window.__steady.suggest())).said).not.toBe('');
  await set(page, { hints: false });
  expect((await page.evaluate(() => window.__steady.suggest())).said).toBe('');
});

test('"Remember my place" off: nothing is kept, and "Where was I?" says so', async ({ page }) => {
  await clinic(page, { trail: false });
  const stop = await page.evaluateHandle(() => window.__steady.trail.watch({ saveMs: 30 }));
  await page.selectOption('#reason', 'Flu shot');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__steady.trail.all())).toEqual([]);
  const where = await page.evaluate(() => window.__steady.trail.where());
  expect(where.said).toBe('I\'m not keeping your place at the moment. You can turn that back on in Settings, under "Remember my place".');
  await stop.dispose();
});

test('"Warn me before a page times out" off: the page\'s own warning is left to speak for itself', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1&timeout=1');
  await inject(page);
  await set(page, { timeout: false });
  await page.evaluate(() => window.__steady.timeout.watch());
  await page.waitForTimeout(2500);
  expect((await spoken(page)).length).toBe(0);
});

test('"Check in if I seem stuck" off: no "take your time", and no offer after missed clicks', async ({ page }) => {
  await clinic(page);
  await page.evaluate(() => window.__steady.recorder.start('Booking'));
  await page.selectOption('#reason', 'Flu shot');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await set(page, { nudges: false });
  await page.evaluate(() => window.__steady.player.setPace({ advanceMs: 30, nudgeMs: 150, offerHelpMs: 300, settleMs: 40, missesBeforeHelp: 2 }));
  await page.evaluate((id) => window.__steady.player.start(id), task.id);
  for (let i = 0; i < 3; i++) await page.mouse.click(900, 600);
  await page.waitForTimeout(600);
  expect(await spoken(page)).toEqual([]);
});

test('"Mention what I picked last time" off: the choice is not kept', async ({ page }) => {
  await clinic(page);
  await page.evaluate(() => window.__steady.recorder.start('Booking'));
  await page.selectOption('#reason', 'Flu shot');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await set(page, { lastTime: false });
  await page.evaluate(() => window.__steady.player.setPace({ advanceMs: 30, settleMs: 40 }));
  await page.evaluate((id) => window.__steady.player.start(id), task.id);
  await page.selectOption('#reason', 'Annual check-up');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__steady.player.lastChoices())).toEqual({});
});

// ---- Calming the page during guided steps (the helper lane's quiet_page and unquiet_page tools) ----

async function withQuietTools(page: Page) {
  await page.evaluate(() => {
    const s = window.__steady;
    for (const name of ['quiet_page', 'unquiet_page']) {
      s.registerTool({ name, owner: 'helper', description: name, parameters: {}, run: async () => (s.calls.push({ port: 'tool', method: name, args: [] }), { ok: true, said: '' }) });
    }
  });
}
const quietCalls = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'tool').map((c) => c.method));

test('the page is calmed while Steady goes through it with her, and put back when that ends', async ({ page }) => {
  await clinic(page);
  await withQuietTools(page);
  await page.evaluate(() => window.__steady.answer('What do I click?'));
  expect(await quietCalls(page)).toEqual([]); // not until she says yes
  await page.evaluate(() => window.__steady.answer('Yes, help me book'));
  expect(await quietCalls(page)).toEqual(['quiet_page']);
  await page.evaluate(() => window.__steady.answer('Stop for now'));
  expect(await quietCalls(page)).toEqual(['quiet_page', 'unquiet_page']);
});

test('the same during a saved task', async ({ page }) => {
  await clinic(page);
  await page.evaluate(() => window.__steady.recorder.start('Booking'));
  await page.selectOption('#reason', 'Flu shot');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await withQuietTools(page);
  await page.evaluate((id) => window.__steady.player.start(id), task.id);
  expect(await quietCalls(page)).toEqual(['quiet_page']);
  await page.evaluate(() => window.__steady.player.stop());
  expect(await quietCalls(page)).toEqual(['quiet_page', 'unquiet_page']);
});

test('"Calm the page during a task" off: the page is left exactly as it is', async ({ page }) => {
  await clinic(page, { calm: false });
  await withQuietTools(page);
  await page.evaluate(() => window.__steady.answer('What do I click?'));
  await page.evaluate(() => window.__steady.answer('Yes, help me book'));
  await page.evaluate(() => window.__steady.answer('Stop for now'));
  expect(await quietCalls(page)).toEqual([]);
});

// Feature 5, the player: Steady walks her through a task a family member recorded, one step at a time.
// She does every step herself. Steady shows where, says what, and moves on when she has done it.
import { expect, test, type Page } from '@playwright/test';
import { inject } from './helpers';

const TASK = "Book a doctor's appointment";
const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => String(c.args[0])));
const lastSaid = async (page: Page) => (await spoken(page)).at(-1);
const lastOptions = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').at(-1)?.args[1]);
const lit = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight' && c.args[0]).at(-1)?.args[0] as { targetId: string; dim?: boolean } | undefined);
const litIs = async (page: Page, selector: string) => {
  const target = await lit(page);
  return page.evaluate(([id, sel]) => window.__steady.api.elementFor(id!) === document.querySelector(sel!), [target?.targetId, selector]);
};
const fast = (page: Page) => page.evaluate(() => window.__steady.player.setPace({ advanceMs: 30, nudgeMs: 60_000, offerHelpMs: 120_000, settleMs: 40, missesBeforeHelp: 3 }));

/** A family member records the first screen of the clinic booking. */
async function recordClinic(page: Page): Promise<string> {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await page.evaluate((n) => window.__steady.recorder.start(n), TASK);
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await page.click('#next');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await page.goto('/clinic/book.html?reset=1'); // later, Rose opens the same page
  await inject(page);
  await fast(page);
  return task.id;
}

/** A family member records buying what is in the basket: one page leads to the next. */
async function recordShop(page: Page): Promise<string> {
  await page.goto('/shop/basket.html?reset=1');
  await inject(page);
  await page.evaluate(() => window.__steady.recorder.start('Pay for my basket'));
  await page.click('#go-checkout');
  await page.waitForURL('**/checkout.html');
  await inject(page);
  await page.evaluate(() => window.__steady.recorder.resume());
  await page.fill('#email', 'someone@example.com');
  await page.locator('#email').blur();
  // Everything the shop insists on, so the order goes through and the last click is recorded.
  for (const [box, text] of Object.entries({ fname: 'A', lname: 'B', addr1: '1 Street', city: 'Town', zip: '01002', phone: '4135550100', ccname: 'A B', ccnum: '4111 1111 1111 1111', ccexp: '04 / 29', cccode: '123' })) {
    await page.evaluate(([id, value]) => ((document.getElementById(id!) as HTMLInputElement).value = value!), [box, text]); // set quietly: not part of the task
  }
  await page.evaluate(() => ((document.getElementById('state') as HTMLSelectElement).selectedIndex = 1));
  await page.click('#place-order');
  await page.waitForURL('**/confirmation.html');
  await inject(page);
  await page.evaluate(() => window.__steady.recorder.resume());
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  return task.id;
}

test('starts a saved task: says the first step with its number, and lights it', async ({ page }) => {
  const id = await recordClinic(page);
  const state = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(state).toMatchObject({
    status: 'step',
    said: `Let us do "${TASK}" together. There are 3 steps, and there is no rush. Step 1. Choose your own: "Reason for your visit". Pick what fits you today.`,
    options: ['Go on', 'Stop for now'],
    step: { number: 1, of: 3 },
  });
  expect(await litIs(page, '#reason')).toBe(true);
  expect((await lit(page))?.dim).not.toBe(false); // a guided step dims the rest of the page
});

test('moves on by itself as she does each step, and says so when the task is finished', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  await page.selectOption('#reason', 'Annual check-up'); // her own answer, not the recorded one
  await expect.poll(() => lastSaid(page)).toBe('Step 2 of 3. Choose your own: "Who would you like to see?". Pick what fits you today.');
  await page.check('[value="okafor"]');
  await expect.poll(() => lastSaid(page)).toBe('Step 3 of 3. Click "Next".');
  expect(await litIs(page, '#next')).toBe(true);
  await page.click('#next');
  await expect.poll(() => lastSaid(page)).toBe(`That was the last step. You have done all 3 steps of "${TASK}".`);
  expect(await page.evaluate(() => window.__steady.player.where())).toBeNull();
});

test('"Go on" skips a step she does not need, and nothing is ever clicked for her', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  const second = await page.evaluate(() => window.__steady.player.next());
  expect(second.said).toBe('Step 2 of 3. Choose your own: "Who would you like to see?". Pick what fits you today.');
  await page.evaluate(() => window.__steady.player.next());
  await page.waitForTimeout(150);
  expect(await page.locator('[data-step="who"]').isVisible()).toBe(true); // "Next" was not pressed for her
});

test('keeps its place when a step leads to another page', async ({ page }) => {
  const id = await recordShop(page);
  await page.goto('/shop/basket.html');
  await inject(page);
  await fast(page);
  const first = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(first.said).toBe('Let us do "Pay for my basket" together. There are 3 steps, and there is no rush. Step 1. Click "Checkout".');
  await page.click('#go-checkout');
  await page.waitForURL('**/checkout.html');
  await inject(page);
  await fast(page);
  const second = await page.evaluate(() => window.__steady.player.resume());
  expect(second?.said).toBe('Step 2 of 3. Type this yourself: "Email for your receipt".');
  expect(await litIs(page, '#email')).toBe(true);
});

test('a step that pays: says it is hers to press, and Steady never presses it', async ({ page }) => {
  const id = await recordShop(page);
  await page.goto('/shop/checkout.html');
  await inject(page);
  await fast(page);
  await page.evaluate((i) => window.__steady.player.start(i, { at: 1 }), id);
  await page.fill('#email', 'rose@example.com');
  await page.locator('#email').blur();
  await expect
    .poll(() => lastSaid(page))
    .toBe('Step 3 of 3. Click "Place order". This is the button that pays. Click it yourself, and only when you are ready.');
  await page.waitForTimeout(150);
  expect(page.url()).toContain('checkout.html'); // still here: nothing was pressed
});

test('the task starts on another page: offers to take her there, and goes only when she says so', async ({ page }) => {
  const id = await recordShop(page);
  await page.goto('/shop/');
  await inject(page);
  await fast(page);
  const state = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(state).toMatchObject({
    status: 'elsewhere',
    said: 'Let us do "Pay for my basket" together. There are 3 steps, and there is no rush. Step 1 is on another page of this website. Shall I take you there?',
    options: ['Yes, take me there', 'Stop for now'],
  });
  expect(page.url()).not.toContain('basket.html');
  await page.evaluate(() => void window.__steady.player.goThere());
  await page.waitForURL('**/basket.html');
  await inject(page);
  await fast(page);
  expect((await page.evaluate(() => window.__steady.player.resume()))?.said).toBe('Step 1 of 3. Click "Checkout".');
});

test("can't find a step: says so plainly, lights nothing, and offers a way on", async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate(() => document.querySelector('#reason')!.closest('.f, div')!.remove());
  const state = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(state).toMatchObject({
    status: 'missing',
    said: `Let us do "${TASK}" together. There are 3 steps, and there is no rush. I can't find step 1 on this page: "Reason for your visit". The page may have changed since this was recorded. You have not done anything wrong. I can still explain the buttons on this page.`,
    options: ['What do I click?', 'Skip this step', "I'm stuck", 'Stop for now'],
  });
  expect(await lit(page)).toBeUndefined();
});

test('a long time on one step: says it again gently, then offers a way out once', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate(() => window.__steady.player.setPace({ nudgeMs: 120, offerHelpMs: 300 }));
  await page.evaluate((i) => window.__steady.player.start(i), id);
  await expect
    .poll(() => spoken(page))
    .toEqual([
      'There is no rush. Choose your own: "Reason for your visit".',
      'Would you like to carry on, stop here for now, or ask someone for help? Nothing you have done is lost.',
    ]);
  expect(await lastOptions(page)).toEqual(['Carry on', 'Stop for now', "I'm stuck"]);
  await page.waitForTimeout(400);
  expect((await spoken(page)).length).toBe(2);
});

test('three clicks that land on nothing: offers help instead of leaving her to struggle', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  for (let i = 0; i < 3; i++) await page.mouse.click(5, 5 + i);
  await expect.poll(() => lastSaid(page)).toBe('Those clicks did not land on anything. That happens. Shall I show you the step again, or would you like to ask someone for help?');
  expect(await lastOptions(page)).toEqual(['Show me again', "I'm stuck"]);
});

test('stopping remembers the place, and starting again offers to carry on from there', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  await page.selectOption('#reason', 'Flu shot');
  await expect.poll(() => lastSaid(page)).toContain('Step 2 of 3');
  const stopped = await page.evaluate(() => window.__steady.player.stop());
  expect(stopped.said).toBe(`I have stopped. I will remember that you got to step 2 of "${TASK}".`);
  expect(await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight').at(-1)!.args[0])).toBeNull();

  const again = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(again).toMatchObject({
    status: 'ask',
    said: `Last time you got to step 2 of 3 in "${TASK}". Shall we carry on from there?`,
    options: ['Carry on from step 2', 'Start again'],
  });
  const carried = await page.evaluate(() => window.__steady.player.carryOn());
  expect(carried.said).toBe('Step 2 of 3. Choose your own: "Who would you like to see?". Pick what fits you today.');
});

test('a task that is not saved: says so', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  expect(await page.evaluate(() => window.__steady.player.start('nope'))).toMatchObject({ status: 'no-task', said: 'I can\'t find that task. It may have been removed.' });
});

test('a set of choices is lit as a whole, so every option stays readable', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i, { at: 1 }), id);
  const target = (await lit(page)) as { targetId: string; group?: string[] };
  expect(target.group?.length).toBe(3); // the three doctors
});

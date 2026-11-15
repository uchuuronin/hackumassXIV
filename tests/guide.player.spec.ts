// Feature 5, the player: Milo walks her through a task a family member recorded, one step at a time.
// She does every step herself. Milo shows where, says what, and moves on when she has done it.
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
    said: `Let's do "${TASK}" together. It's 3 steps, and there's no rush. Step 1. For "Reason for your visit", pick what fits you today.`,
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
  await expect.poll(() => lastSaid(page)).toBe('Step 2 of 3. For "Who would you like to see?", choose whichever suits you.');
  await page.check('[value="okafor"]');
  await expect.poll(() => lastSaid(page)).toBe('Step 3 of 3. Click "Next".');
  expect(await litIs(page, '#next')).toBe(true);
  await page.click('#next');
  await expect.poll(() => lastSaid(page)).toBe(`That was the last step. You're all done with "${TASK}".`);
  expect(await page.evaluate(() => window.__steady.player.where())).toBeNull();
});

test('"Go on" skips a step she does not need, and nothing is ever clicked for her', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  const second = await page.evaluate(() => window.__steady.player.next());
  expect(second.said).toBe('Step 2 of 3. For "Who would you like to see?", choose whichever suits you.');
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
  expect(first.said).toBe('Let\'s do "Pay for my basket" together. It\'s 3 steps, and there\'s no rush. Step 1. Click "Checkout".');
  await page.click('#go-checkout');
  await page.waitForURL('**/checkout.html');
  await inject(page);
  await fast(page);
  const second = await page.evaluate(() => window.__steady.player.resume());
  expect(second?.said).toBe('Step 2 of 3. Type in "Email for your receipt".');
  expect(await litIs(page, '#email')).toBe(true);
});

test('a step that pays: says it is hers to press, and Milo never presses it', async ({ page }) => {
  const id = await recordShop(page);
  await page.goto('/shop/checkout.html');
  await inject(page);
  await fast(page);
  await page.evaluate((i) => window.__steady.player.start(i, { at: 1 }), id);
  await page.fill('#email', 'rose@example.com');
  await page.locator('#email').blur();
  await expect
    .poll(() => lastSaid(page))
    .toBe('Step 3 of 3. Click "Place order". This is the one that pays. That click is yours, whenever you\'re ready.');
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
    said: 'Let\'s do "Pay for my basket" together. It\'s 3 steps, and there\'s no rush. Step 1 is on another page of this website. Want me to take you there?',
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
    said: `Let's do "${TASK}" together. It's 3 steps, and there's no rush. I can't find step 1 on this page: "Reason for your visit". The website may have changed since this was set up. You haven't done anything wrong. I can still tell you what the buttons here do.`,
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
      'Take your time. For "Reason for your visit", pick what fits you today.',
      'Want to keep going, stop here for now, or ask someone for a hand? Nothing you\'ve done is lost.',
    ]);
  expect(await lastOptions(page)).toEqual(['Carry on', 'Stop for now', "I'm stuck"]);
  await page.waitForTimeout(400);
  expect((await spoken(page)).length).toBe(2);
});

test('three clicks that land on nothing: offers help instead of leaving her to struggle', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  for (let i = 0; i < 3; i++) await page.mouse.click(5, 5 + i);
  await expect.poll(() => lastSaid(page)).toBe('Those clicks didn\'t land on anything. It happens. Want me to show you the step again, or would you rather ask someone for a hand?');
  expect(await lastOptions(page)).toEqual(['Show me again', "I'm stuck"]);
});

test('stopping remembers the place, and starting again offers to carry on from there', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate((i) => window.__steady.player.start(i), id);
  await page.selectOption('#reason', 'Flu shot');
  await expect.poll(() => lastSaid(page)).toContain('Step 2 of 3');
  const stopped = await page.evaluate(() => window.__steady.player.stop());
  expect(stopped.said).toBe(`Okay, I've stopped. I'll remember you got to step 2 of "${TASK}".`);
  expect(await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight').at(-1)!.args[0])).toBeNull();

  const again = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(again).toMatchObject({
    status: 'ask',
    said: `Last time you got to step 2 of 3 in "${TASK}". Want to pick up from there?`,
    options: ['Carry on from step 2', 'Start again'],
  });
  const carried = await page.evaluate(() => window.__steady.player.carryOn());
  expect(carried.said).toBe('Step 2 of 3. For "Who would you like to see?", choose whichever suits you.');
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

// ---- "Last time you picked…" ----

/** Rose does the clinic task once, with her own answers. */
async function playOnce(page: Page, id: string) {
  await page.evaluate((i) => window.__steady.player.start(i), id);
  await page.selectOption('#reason', 'Annual check-up');
  await expect.poll(() => lastSaid(page)).toContain('Step 2 of 3');
  await page.check('[value="okafor"]');
  await expect.poll(() => lastSaid(page)).toContain('Step 3 of 3');
  await page.click('#next');
  await expect.poll(() => lastSaid(page)).toContain('That was the last step');
  await page.goto('/clinic/book.html?reset=1'); // another day
  await inject(page);
  await fast(page);
}

test('the second time, it mentions what she picked last time, and leaves the choice to her', async ({ page }) => {
  const id = await recordClinic(page);
  await playOnce(page, id);
  const first = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(first.said).toBe(
    `Let's do "${TASK}" together. It's 3 steps, and there's no rush. Step 1. For "Reason for your visit", last time you picked "Annual check-up". Go with that again, or pick something else. It's up to you.`,
  );
  expect(await page.inputValue('#reason')).not.toBe('Annual check-up'); // mentioned, never chosen for her
  await page.selectOption('#reason', 'Flu shot');
  await expect.poll(() => lastSaid(page)).toBe(`Step 2 of 3. For "Who would you like to see?", last time you picked "Dr. Amara Okafor". Same again, or something different?`);
  expect(await page.isChecked('[value="okafor"]')).toBe(false);
});

test('last time\'s option is pointed out for a moment, then left alone', async ({ page }) => {
  const id = await recordClinic(page);
  await playOnce(page, id);
  await page.evaluate(() => window.__steady.player.setPace({ lastTimeMs: 150 }));
  await page.evaluate((i) => window.__steady.player.start(i, { at: 1 }), id);
  const notes = () =>
    page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.args[0] === 'last-time').map((c) => (c.method === 'labels' ? (c.args[1] as Array<{ targetId: string; text: string }>)[0] : 'clear')));
  await expect.poll(async () => (await notes()).length).toBe(2);
  const [shown, cleared] = await notes();
  expect((shown as { text: string }).text).toBe('Last time');
  expect(await page.evaluate((t) => (window.__steady.api.elementFor(t) as HTMLInputElement).value, (shown as { targetId: string }).targetId)).toBe('okafor');
  expect(cleared).toBe('clear');
});

test('what is remembered: the choice she made, on this computer, and never a date of birth or anything typed', async ({ page }) => {
  const id = await recordClinic(page);
  await playOnce(page, id);
  const kept = await page.evaluate(() => window.__steady.player.lastChoices());
  expect(Object.values(kept[id]!)).toEqual(['"Annual check-up"', '"Dr. Amara Okafor"']);
  expect((await page.evaluate(() => window.__steady.player.forgetChoices())).said).toBe("Done. I've forgotten what you picked last time.");
  const again = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(again.said).toContain('For "Reason for your visit", pick what fits you today.');
});

test('a day and a time: says the day of the week and the time, as a person would', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  expect(await page.evaluate(() => window.__steady.player.spoken('date', '2026-11-21'))).toBe('a Saturday');
  expect(await page.evaluate(() => window.__steady.player.spoken('time', '09:00'))).toBe('9 in the morning');
  expect(await page.evaluate(() => window.__steady.player.spoken('time', '14:30'))).toBe('2:30 in the afternoon');
});

test('a task that came from another computer: says so the first time, and where it goes', async ({ page }) => {
  const id = await recordClinic(page);
  await page.evaluate(async () => {
    const s = window.__steady;
    const all = await s.recorder.tasks();
    await s.store.set('guide:tasks', all.map((t) => ({ ...t, shared: { at: Date.now() } })));
  });
  const first = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(first.said).toBe(
    `Let's do "${TASK}" together. Someone sent you this one from another computer, and it's for the website localhost. It's 3 steps, and there's no rush. Step 1. For "Reason for your visit", pick what fits you today.`,
  );
  await page.evaluate(() => window.__steady.player.stop());
  const second = await page.evaluate((i) => window.__steady.player.start(i), id);
  expect(second.said).not.toContain('from another computer');
});

// ---- "Help me fill this in" in the middle of a saved task ----

const weekdayFor = (page: Page) =>
  page.evaluate(() => {
    const d = new Date(`${(document.querySelector('#day') as HTMLInputElement).min}T12:00:00`);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

/** Gets the clinic booking to its "Your details" part, as Rose would by hand. */
async function toYourDetails(page: Page) {
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await page.click('#next');
  await page.fill('#day', await weekdayFor(page));
  await page.locator('#day').blur();
  await page.selectOption('#time', { index: 1 });
  await page.click('#next');
}

/** A family member records the whole booking, up to the last "Next". Returns the task and where "First name" is in it. */
async function recordWholeBooking(page: Page): Promise<{ id: string; firstName: number; steps: number }> {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await page.evaluate((n) => window.__steady.recorder.start(n), TASK);
  await toYourDetails(page);
  await page.fill('#first', 'A');
  await page.locator('#first').blur();
  await page.fill('#last', 'B');
  await page.locator('#last').blur();
  await page.selectOption('[name="dob_month"]', { index: 3 });
  await page.selectOption('[name="dob_day"]', { index: 3 });
  await page.selectOption('[name="dob_year"]', { index: 30 });
  await page.fill('#phone', '4135550100');
  await page.locator('#phone').blur();
  await page.click('#next');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  // Later, Rose is part-way through the same booking, at "Your details".
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await fast(page);
  await page.evaluate(() => window.__steady.details.save({ givenName: 'Rose', familyName: 'Marchetti', phone: '413 555 0142' }));
  await toYourDetails(page);
  return { id: task.id, firstName: task.steps.findIndex((s) => s.locator.label === 'First name'), steps: task.steps.length };
}

test('boxes that are filled in already are skipped, and Milo says which', async ({ page }) => {
  const task = await recordWholeBooking(page);
  await page.fill('#first', 'Rose');
  await page.fill('#last', 'Marchetti');
  const state = await page.evaluate(([id, at]) => window.__steady.player.start(id as string, { at: at as number }), [task.id, task.firstName] as const);
  expect(state.said).toContain('"First name" and "Last name" are filled in already, so we\'ll skip those.');
  expect(state.said).toContain(`Step ${task.firstName + 3}.`);
  expect(await litIs(page, '[name="dob_month"]')).toBe(true); // the first thing still to do: her date of birth
});

test('"Help me fill this in" in the middle of a task: the task waits quietly, then picks up at what is still to do', async ({ page }) => {
  const task = await recordWholeBooking(page);
  await page.evaluate(([id, at]) => window.__steady.player.start(id as string, { at: at as number }), [task.id, task.firstName] as const);
  const before = (await spoken(page)).length;

  await page.evaluate(() => window.__steady.answer('Help me fill this in'));
  await page.evaluate(() => window.__steady.answer('Yes, fill them in'));
  expect(await page.inputValue('#first')).toBe('Rose');
  await page.waitForTimeout(400);
  expect((await spoken(page)).length).toBe(before); // the task said nothing while the form was being filled

  const done = await page.evaluate(() => window.__steady.answer('Stop for now')); // she ends the filling here
  expect(done.then?.said).toContain('"First name" and "Last name" are filled in already, so we\'ll skip those.');
  expect(done.then?.said).toMatch(/Step \d+\. /);
  expect(await litIs(page, '[name="dob_month"]')).toBe(true); // her date of birth: the step in the middle that was left
  expect(await page.evaluate(() => window.__steady.player.isPlaying())).toBe(true);

  // She does that one herself. The phone number is filled in already, so the task goes straight on to "Next".
  await page.selectOption('[name="dob_month"]', { index: 3 });
  await page.selectOption('[name="dob_day"]', { index: 3 });
  await page.selectOption('[name="dob_year"]', { index: 30 });
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^"Mobile phone" is filled in already, so we'll skip it\. Step \d+\. Click "Next"\./);
  expect(await page.locator('[data-step="you"]').isVisible()).toBe(true); // and "Next" is still hers to click
});

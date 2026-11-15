// Features 5 and 12, the recorder: a family member does a task once, and Milo keeps the steps, not the answers.
import { expect, test, type Page } from '@playwright/test';
import { getMap, inject } from './helpers';

const begin = async (page: Page, name: string) => {
  await inject(page);
  return page.evaluate((n) => window.__steady.recorder.start(n), name);
};
const finish = (page: Page) => page.evaluate(() => window.__steady.recorder.stop());

test('booking at the clinic: three step types, and none of her answers are kept', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  const started = await begin(page, "Book a doctor's appointment");
  expect(started.said).toBe('I\'m watching now. Do the task the way you normally would. I never save what you type or choose.');

  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await page.click('#next');
  const day = await page.evaluate(() => {
    const d = new Date((document.querySelector('#day') as HTMLInputElement).min + 'T12:00');
    while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  await page.fill('#day', day);
  await page.selectOption('#time', '10:30 am');
  await page.click('#next');
  await page.fill('#first', 'Marguerite');
  await page.fill('#last', 'Delacroix');
  await page.locator('#last').blur(); // as happens when a person moves to the next box
  await page.selectOption('[name="dob_month"]', '3');
  await page.selectOption('[name="dob_day"]', '9');
  await page.selectOption('[name="dob_year"]', '1948');
  await page.fill('#phone', '413-555-0199');
  await page.locator('#phone').blur();
  await page.click('#next');
  await page.waitForTimeout(50);
  const { task, said } = await finish(page);

  expect(task.steps.map((s) => `${s.type}: ${s.say}`)).toEqual([
    'choose: Choose your own: "Reason for your visit".',
    'choose: Choose your own: "Who would you like to see?".',
    'click: Click "Next".',
    'choose: Choose your own: "Day".',
    'choose: Choose your own: "Time".',
    'click: Click "Next".',
    'type: Type this yourself: "First name".',
    'type: Type this yourself: "Last name".',
    'choose: Choose your own: "Date of birth".',
    'type: Type this yourself: "Mobile phone".',
    'click: Click "Next".',
  ]);
  expect(said).toBe('Saved "Book a doctor\'s appointment" with 11 steps.');
  const saved = JSON.stringify(task);
  for (const answer of ['Flu shot', 'herrera', 'Herrera', '10:30', 'Marguerite', 'Delacroix', '1948', '0199', day]) {
    expect(saved).not.toContain(answer);
  }
  // The steps say which page they belong to, so "Where was I?" can find the place.
  expect(task.steps[0]!.page).toMatchObject({ path: '/clinic/book.html', stage: 'booking' });
});

test('pressing Enter to send a form counts as a click on its button, and a password is never kept', async ({ page }) => {
  await page.goto('/clinic/signin.html?reset=1');
  await begin(page, 'Sign in to the clinic');
  await page.fill('#email', 'daughter@example.com');
  await page.fill('#password', 'correct horse battery');
  await page.press('#password', 'Enter');
  await page.waitForTimeout(50);
  const { task } = await finish(page);
  expect(task.steps.map((s) => s.say)).toEqual(['Type this yourself: "Email address".', 'Type this yourself: "Password".', 'Click "Sign in".']);
  expect(task.steps[1]!.locator.secret).toBe('password');
  expect(JSON.stringify(task)).not.toContain('horse');
  expect(JSON.stringify(task)).not.toContain('daughter@');
});

test('keeps recording across page loads', async ({ page }) => {
  await page.goto('/shop/?reset=1');
  await begin(page, 'Buy the lamp');
  await page.click('[data-add="lamp"]');
  await page.click('.basket-link');
  await page.waitForURL('**/basket.html');
  await inject(page);
  expect(await page.evaluate(() => window.__steady.recorder.resume())).toBe(true);
  await page.click('#go-checkout');
  await page.waitForURL('**/checkout.html');
  await inject(page);
  await page.evaluate(() => window.__steady.recorder.resume());
  const { task } = await finish(page);
  expect(task.steps.map((s) => `${s.page.path} ${s.say}`)).toEqual([
    '/shop/ Click "Add to basket" for the Brass reading lamp.',
    '/shop/ Click "Basket".',
    '/shop/basket.html Click "Checkout".',
  ]);
});

test('ignores clicks on nothing, and stops listening when recording stops', async ({ page }) => {
  await page.goto('/shop/basket.html?reset=1');
  await begin(page, 'Nothing much');
  await page.click('h1');
  const { task } = await finish(page);
  expect(task.steps).toEqual([]);
  expect(await page.evaluate(() => window.__steady.recorder.isRecording())).toBe(false);
  // And nothing is picked up again on the next page.
  await page.click('#keep');
  await page.waitForURL('**/shop/');
  await inject(page);
  expect(await page.evaluate(() => window.__steady.recorder.resume())).toBe(false);
});

test.describe('finding a recorded step again', () => {
  async function recordPurchase(page: Page) {
    await page.goto('/shop/basket.html?reset=1&look=1');
    await begin(page, 'Buy');
    await page.click('[data-remove="teapot"]');
    await page.click('#go-checkout');
    await page.waitForURL('**/checkout.html');
    await inject(page);
    await page.evaluate(() => window.__steady.recorder.resume());
    await page.evaluate(() => (document.querySelector('#checkout') as HTMLFormElement).addEventListener('submit', (e) => (e.preventDefault(), e.stopImmediatePropagation()), true));
    await page.click('#place-order');
    return (await finish(page)).task;
  }
  const find = (page: Page, step: unknown) =>
    page.evaluate((s) => {
      const hit = window.__steady.recorder.locate(s as never, window.__steady.api.get());
      const el = hit && window.__steady.api.get().elements.find((e) => e.id === hit.id)!;
      return hit && { label: el!.context ? `${el!.label} (${el!.context})` : el!.label, confident: hit.confident };
    }, step);

  test('on the same site: the right one of three look-alike buttons', async ({ page }) => {
    const task = await recordPurchase(page);
    await page.goto('/shop/basket.html?reset=1&look=1');
    await getMap(page);
    expect(await find(page, task.steps[0])).toEqual({ label: 'Remove (Two-cup teapot)', confident: true });
    expect(await find(page, task.steps[1])).toEqual({ label: 'Checkout', confident: true });
  });

  test('after a redesign: found by more than its name, and a weaker match is offered as a guess', async ({ page }) => {
    const task = await recordPurchase(page);
    await page.goto('/shop/basket.html?reset=1&look=2');
    await getMap(page);
    // New wording and a new id, but it still leads to the same page.
    expect(await find(page, task.steps[1])).toEqual({ label: 'Go to checkout', confident: true });
    await page.goto('/shop/checkout.html?look=2');
    await getMap(page);
    // "Place order" is now "Complete purchase". Milo offers it as its best guess and asks.
    expect(await find(page, task.steps[2])).toEqual({ label: 'Complete purchase', confident: false });
  });

  test('a step that is not on this page at all: no guess', async ({ page }) => {
    const task = await recordPurchase(page);
    await page.goto('/clinic/?reset=1');
    await getMap(page);
    expect(await find(page, task.steps[0])).toBeNull();
  });
});

test('a "choose yours" step is found again by its question, not by the answer that was picked', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await begin(page, 'Pick a doctor');
  await page.check('[value="herrera"]');
  const { task } = await finish(page);
  await page.goto('/clinic/book.html?reset=1');
  await getMap(page);
  const found = await page.evaluate((s) => {
    const hit = window.__steady.recorder.locate(s as never, window.__steady.api.get())!;
    return { group: window.__steady.api.get().elements.find((e) => e.id === hit.id)!.group, confident: hit.confident };
  }, task.steps[0]);
  expect(found).toEqual({ group: 'Who would you like to see?', confident: true });
});

test("a click that A's click steadying steered onto a button is recorded, once", async ({ page }) => {
  await page.goto('/shop/basket.html?reset=1');
  await begin(page, 'Steered');
  // What click steadying does: the real click lands just beside a button, is cancelled, and is fired again on the button.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('#keep')!;
    button.addEventListener('click', (e) => e.preventDefault()); // stay on this page for the test
    window.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        button.click();
      },
      true,
    );
  });
  await page.mouse.click(600, 600); // empty space
  const { task } = await finish(page);
  expect(task.steps.map((s) => s.say)).toEqual(['Click "Continue shopping".']);
});

test('a saved task can be removed, by the person who recorded it', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await begin(page, 'Book a check-up');
  await page.selectOption('#reason', 'Flu shot');
  const { task } = await finish(page);
  expect((await page.evaluate(() => window.__steady.recorder.tasks())).length).toBe(1);
  expect(await page.evaluate((id) => window.__steady.recorder.remove(id), task.id)).toEqual({ said: 'Removed "Book a check-up".' });
  expect(await page.evaluate(() => window.__steady.recorder.tasks())).toEqual([]);
});

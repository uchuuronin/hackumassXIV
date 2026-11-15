// Feature 8, "Where was I?". Steady keeps a private trail on this computer: the page, how far down it she was,
// and what she typed into ordinary boxes. Never a password, a card, an ID number or a date of birth.
// When she comes back, or the page clears itself, it can put her back where she was.
import { expect, test, type Page } from '@playwright/test';
import { inject } from './helpers';

const a = (page: Page, words: string) => page.evaluate((w) => window.__steady.answer(w), words);
const load = async (page: Page, url: string) => {
  await page.goto(url);
  await inject(page);
  await page.evaluate(() => window.__steady.trail.watch({ saveMs: 20 }));
};
async function type(page: Page, selector: string, text: string) {
  await page.fill(selector, text);
  await page.locator(selector).blur();
}
/** She fills in part of the checkout, card and all, then the page is reloaded and comes back empty. */
async function partWay(page: Page) {
  await load(page, '/shop/checkout.html?reset=1');
  await type(page, '#email', 'rose@example.com');
  await type(page, '#fname', 'Rose');
  await type(page, '#ccnum', '4111 1111 1111 1111');
  await type(page, '#cccode', '987');
  await page.evaluate(() => window.scrollTo(0, 320));
  await page.waitForTimeout(150);
  await load(page, '/shop/checkout.html');
}

test('"Where was I?" on a page she had started: says what it kept and offers to put it back', async ({ page }) => {
  await partWay(page);
  expect(await page.inputValue('#email')).toBe(''); // the page came back empty
  expect(await a(page, 'Where was I?')).toEqual({
    said: 'You were part-way through this page. I kept what you typed in 2 boxes: "Email for your receipt" and "First name". Want me to put it back?',
    options: ['Yes, put it back', 'No, thank you'],
  });
});

test('"Yes, put it back": the ordinary boxes are filled again and the page is where she left it', async ({ page }) => {
  await partWay(page);
  await a(page, 'Where was I?');
  expect(await a(page, 'Yes, put it back')).toEqual({ said: "Done. I've put back 2 boxes. I never keep card numbers or passwords, so those are still yours to type." });
  expect(await page.inputValue('#email')).toBe('rose@example.com');
  expect(await page.inputValue('#fname')).toBe('Rose');
  expect(await page.inputValue('#ccnum')).toBe('');
  expect(await page.inputValue('#cccode')).toBe('');
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(250);
});

test('what is kept never includes a card, a password, a code, an ID number or a date of birth', async ({ page }) => {
  await partWay(page);
  await load(page, '/clinic/signin.html?reset=1');
  await type(page, '#email', 'rose@example.com');
  await type(page, '#password', 'hunter2-secret');
  await page.waitForTimeout(150);
  const kept = JSON.stringify(await page.evaluate(() => window.__steady.trail.all()));
  expect(kept).toContain('rose@example.com');
  expect(kept).not.toMatch(/4111|987|hunter2/);
});

test('it never writes over something she has typed since', async ({ page }) => {
  await partWay(page);
  await type(page, '#fname', 'Rosa');
  await a(page, 'Where was I?');
  await a(page, 'Yes, put it back');
  expect(await page.inputValue('#fname')).toBe('Rosa');
  expect(await page.inputValue('#email')).toBe('rose@example.com');
});

test('"No, thank you": the page is left alone', async ({ page }) => {
  await partWay(page);
  await a(page, 'Where was I?');
  expect(await a(page, 'No, thank you')).toEqual({ said: "No problem. I've left the page as it is." });
  expect(await page.inputValue('#email')).toBe('');
});

test('on a different page: says where she was and offers to take her back, then offers to put it back', async ({ page }) => {
  await partWay(page);
  await load(page, '/shop/');
  expect(await a(page, 'Where was I?')).toEqual({
    said: 'Last time you were part-way through a page called "Checkout · Pennywhistle Home". Want me to take you back there?',
    options: ['Yes, take me there', 'No, thank you'],
  });
  await page.evaluate(() => void window.__steady.answer('Yes, take me there'));
  await page.waitForURL('**/checkout.html');
  await inject(page);
  const arrived = await page.evaluate(() => window.__steady.trail.arrive());
  expect(arrived?.said).toBe('Here we are. I kept what you typed in 2 boxes: "Email for your receipt" and "First name". Want me to put it back?');
});

test('in the middle of a saved task: says the step she is on', async ({ page }) => {
  await load(page, '/clinic/book.html?reset=1');
  await page.evaluate(() => window.__steady.recorder.start('Book a check-up'));
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await load(page, '/clinic/book.html?reset=1');
  await page.evaluate(() => window.__steady.player.setPace({ advanceMs: 20, settleMs: 30 }));
  await page.evaluate((id) => window.__steady.player.start(id, { at: 1 }), task.id);
  expect((await a(page, 'Where was I?')).said).toBe('We\'re doing "Book a check-up". Step 2 of 2. For "Who would you like to see?", choose whichever suits you.');
});

test('nothing from before: says so, without fuss', async ({ page }) => {
  await load(page, '/shop/?reset=1');
  await page.evaluate(() => window.__steady.trail.forget());
  expect(await a(page, 'Where was I?')).toEqual({ said: "I don't have anything from before. We can start fresh whenever you like." });
});

test('the page cleared itself after a countdown: offers to put back what she typed', async ({ page }) => {
  await partWay(page);
  await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', '<div role="status" class="session-bar">Your session ended and the form was cleared. Please start again.</div>'));
  expect(await page.evaluate(() => window.__steady.timeout.check())).toEqual({
    status: 'ended',
    said: 'The page has reset itself and cleared what was typed. That was the website, not you. I kept what you typed in 2 boxes. Want me to put it back?',
    options: ['Yes, put it back', 'No, thank you'],
  });
});

test('"Forget where I was" clears the trail', async ({ page }) => {
  await partWay(page);
  await page.evaluate(() => window.__steady.trail.forget());
  expect(await page.evaluate(() => window.__steady.trail.all())).toEqual([]);
});

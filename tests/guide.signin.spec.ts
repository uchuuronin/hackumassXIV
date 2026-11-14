// Feature 5, sign-in guidance. Signing in is where people most often give up: two boxes, a password
// nobody remembers, and sometimes a code. Steady says what each part is for, never touches the password,
// and says what to do when it is forgotten.
import { expect, test, type Page } from '@playwright/test';
import { html, inject } from './helpers';

const a = (page: Page, words: string) => page.evaluate((w) => window.__steady.answer(w), words);
const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => String(c.args[0])));

async function clinic(page: Page, details: object | null = null) {
  await page.goto('/clinic/signin.html?reset=1');
  await inject(page);
  await page.evaluate((d) => {
    window.__steady.details.setPace({ advanceMs: 30, nudgeMs: 60_000, offerHelpMs: 120_000 });
    return d ? window.__steady.details.save(d) : window.__steady.details.clear();
  }, details as never);
}

test('the panel notices a sign-in page and offers to help with it', async ({ page }) => {
  await clinic(page);
  expect(await page.evaluate(() => window.__steady.suggest())).toEqual({
    said: 'This page is asking you to sign in. I can take you through it.',
    options: ['Help me sign in', 'What do I click?'],
  });
});

test('"Help me sign in": says why the page is asking, then goes box by box', async ({ page }) => {
  await clinic(page);
  const first = await a(page, 'Help me sign in');
  expect(first.said).toBe('This page wants to know it is you, so it can show you your own things. There are 2 boxes. This box is for your email: "Email address".');
  await page.fill('#email', 'rose@example.com');
  await page.locator('#email').blur();
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('"Password". This is your password. Please type this one yourself. Steady never sees or keeps passwords.');
});

test('with her email saved: offers to fill it, and never the password', async ({ page }) => {
  await clinic(page, { givenName: 'Rose', email: 'rose@example.com' });
  const offer = await a(page, 'Help me sign in');
  expect(offer.said).toBe('This page wants to know it is you, so it can show you your own things. There are 2 boxes. I can fill in your email from "My details". Shall I?');
  await a(page, 'Yes, fill them in');
  expect(await page.inputValue('#email')).toBe('rose@example.com');
  expect(await page.inputValue('#password')).toBe('');
});

test('stuck on the password: says what to do when it is forgotten', async ({ page }) => {
  await clinic(page);
  await page.evaluate(() => window.__steady.details.setPace({ nudgeMs: 150, offerHelpMs: 60_000 }));
  await a(page, 'Help me sign in');
  await a(page, 'Go on'); // on to the password box
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('There is no rush. If you can\'t remember your password, that happens to everyone. Click "Forgot your password?" and the website will help you make a new one.');
});

test('a code sent to her phone: says what it is, where to type it, and never to read it to anyone', async ({ page }) => {
  await html(page, `<form><h2>Check it is you</h2><label>6-digit code <input name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6"></label><button type="submit">Verify</button> <a href="#">Send a new code</a></form>`);
  await page.evaluate(() => window.__steady.details.clear());
  const first = await a(page, 'Help me sign in');
  expect(first.said).toBe(
    'The website has sent you a short code, to check it is really you. Never read this code to anyone on the telephone, even if they say they are from the website. "6-digit code". Look for a text message on your phone, then type the numbers from it here. There is no rush.',
  );
});

test('not a sign-in page: says so and offers what does fit', async ({ page }) => {
  await page.goto('/shop/basket.html?reset=1');
  await inject(page);
  expect(await a(page, 'Help me sign in')).toEqual({
    said: 'This does not look like a page for signing in. I can still explain the buttons here.',
    options: ['What do I click?'],
  });
});

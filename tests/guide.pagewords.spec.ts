// What Gemini may read of a page: the words she can read herself, so it can answer "which is cheapest?".
// Never what she typed, never a page that is about signing in, paying or her money or health.
import { expect, test, type Page } from '@playwright/test';
import { html, inject } from './helpers';

const words = (page: Page) => page.evaluate(() => window.__steady.words.read());

test('it reads the main part of the page in order, with headings marked, and leaves the menu and the footer out', async ({ page }) => {
  await html(page, `<nav><a href="/">Home</a> <a href="/sale">Sale</a></nav>
    <main><h1>Kettles</h1><p>The red kettle costs $24.</p><ul><li>The blue kettle costs $19.</li></ul></main>
    <footer>Copyright Pennywhistle</footer>`);
  const got = await words(page);
  expect(got.held).toBeUndefined();
  expect(got.words).toBe('# Kettles\nThe red kettle costs $24.\nThe blue kettle costs $19.');
});

test('nothing she typed is read: not a box, not a longer note, not a page she can write on', async ({ page }) => {
  await html(page, `<main><p>Tell us about your visit.</p><input value="Rose Marlow"><textarea>my knee hurts</textarea>
    <div contenteditable="true">a private note</div><select><option selected>Dr Okafor</option></select></main>`);
  await page.fill('input', 'Rose Typed-This');
  const got = (await words(page)).words;
  expect(got).toBe('Tell us about your visit.');
});

test('hidden words and Milo\'s own notes are not read', async ({ page }) => {
  await html(page, `<main><p>Seen.</p><p style="display:none">Not seen.</p><p hidden>Nor this.</p><p style="visibility:hidden">Nor this either.</p>
    <div data-steady-ui><p>A note from Milo.</p></div><script>var secret = 'x'</script></main>`);
  expect((await words(page)).words).toBe('Seen.');
});

test('long numbers, email addresses and anything shaped like an ID number are blanked; a telephone number is kept', async ({ page }) => {
  await html(page, `<main><p>Card ending 4111 1111 1111 1111 on file.</p><p>Signed in as rose.marlow@example.com</p>
    <p>ID 123-45-6789</p><p>Call the front desk on 555-0142 or (413) 555-0199.</p></main>`);
  const got = (await words(page)).words;
  expect(got).not.toContain('4111');
  expect(got).not.toContain('rose.marlow');
  expect(got).not.toContain('123-45-6789');
  expect(got).toContain('[a long number]');
  expect(got).toContain('[an email address]');
  expect(got).toContain('555-0142');
  expect(got).toContain('(413) 555-0199');
});

test('a page for signing in or paying is not read at all', async ({ page }) => {
  for (const url of ['/clinic/signin.html', '/shop/checkout.html?reset=1']) {
    await page.goto(url);
    await inject(page);
    const got = await words(page);
    expect(got.words, url).toBe('');
    expect(got.held, url).toBe('private');
  }
});

test('a page about her money or her health is not read at all, even with nothing to type on it', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><head><title>Valley Bank: account summary</title></head><body><main><h1>Your accounts</h1><p>Checking: $1,204.11</p></main></body></html>');
  await page.addScriptTag({ path: 'tests/.tmp/pagemap.js' });
  expect(await words(page)).toEqual({ words: '', held: 'private' });
  await page.setContent('<!doctype html><html lang="en"><head><title>MyChart</title></head><body><main><h1>Test results</h1><p>Cholesterol 210</p></main></body></html>');
  await page.addScriptTag({ path: 'tests/.tmp/pagemap.js' });
  expect((await words(page)).held).toBe('private');
});

test('a long page is cut at a whole word, at the limit', async ({ page }) => {
  await html(page, `<main><p>${'kettle '.repeat(3000)}</p></main>`);
  const got = (await words(page)).words;
  expect(got.length).toBeLessThanOrEqual(6000);
  expect(got.endsWith('kettle')).toBe(true);
});

test('she can switch it off, and then nothing is read', async ({ page }) => {
  await html(page, '<main><p>The red kettle costs $24.</p></main>');
  await page.evaluate(() => window.__steady.store.set('guide:switches', { words: false }));
  expect(await page.evaluate(() => window.__steady.words.forGemini())).toEqual({ words: '', held: 'off' });
  await page.evaluate(() => window.__steady.store.set('guide:switches', { words: true }));
  expect((await page.evaluate(() => window.__steady.words.forGemini())).words).toContain('red kettle');
});

test('a price and its crossed-out old price are kept apart, and the old one is marked as old', async ({ page }) => {
  await html(page, '<main><div class="card"><h3>Brass lamp</h3><p><span class="now">$34.00</span><s>$42.00</s></p><p>In stock<b>today</b>.</p></div></main>');
  const got = (await words(page)).words;
  expect(got).toContain('$34.00 (was $42.00)');
  expect(got).toContain('In stock today.');
});

test('a picture of the screen is allowed on an ordinary page, never on a private one, and not when she has switched it off', async ({ page }) => {
  await html(page, '<main><p>The red kettle costs $24.</p></main>');
  expect(await page.evaluate(() => window.__steady.words.mayLook())).toEqual({ ok: true });
  await page.evaluate(() => window.__steady.store.set('guide:switches', { sight: false }));
  expect(await page.evaluate(() => window.__steady.words.mayLook())).toEqual({ ok: false, held: 'off' });
  await page.goto('/shop/checkout.html?reset=1');
  await inject(page);
  expect(await page.evaluate(() => window.__steady.words.mayLook())).toEqual({ ok: false, held: 'private' });
});

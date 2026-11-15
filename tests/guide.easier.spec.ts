// "Make this page easier": Milo repairs, from her side, what the website should have got right.
// Faint words, buttons with no name, no way to see the keyboard's place, things that keep moving.
// It says what it did, it never guesses a name, and it can put everything back.
import { expect, test, type Page } from '@playwright/test';
import { html } from './helpers';

const press = (page: Page, words: string) => page.evaluate((w) => window.__steady.answer(w), words);

function luminance([r, g, b]: number[]): number {
  const [x, y, z] = [r!, g!, b!].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
}
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi! + 0.05) / (lo! + 0.05);
};
const rgb = (page: Page, selector: string) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel)!).color.match(/[\d.]+/g)!.slice(0, 3).map(Number), selector);

const BAD = `
  <style>
    body { background: #ffffff; font: 16px sans-serif; }
    .faint { color: #b8b8b8; }
    .brand { color: #7ab8ff; }
    .dark { background: #1b2430; padding: 8px; }
    .dark p { color: #55606e; }
    .photo { background-image: linear-gradient(#fff, #000); }
    .photo p { color: #999; }
    .fine { color: #222222; }
    a.icon, button.icon { display: inline-block; width: 40px; height: 40px; }
    * { outline: none; }
    .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <main>
  <p class="faint" id="faint">Delivery is free on orders over fifty dollars.</p>
  <p><a class="brand" id="link" href="/offers">See this week's offers</a></p>
  <div class="dark"><p id="ondark">Open until nine tonight.</p></div>
  <div class="photo"><p id="onphoto">Words over a picture.</p></div>
  <p class="fine" id="fine">This one is easy to read already.</p>
  <a class="icon cart-link" id="cart" href="/cart?session=abc123"><svg class="icon-cart" width="24" height="24"><path d="M0 0h24v24H0z"/></svg></a>
  <button class="icon js-toggle-x91" id="mystery"><svg width="24" height="24"><path d="M0 0h24v24H0z"/></svg></button>
  <input id="email" type="email" placeholder="Email address">
  <div class="spin" id="spin">*</div>
  <button id="named">Add to basket</button>
  </main>`;

test('faint words are made dark enough to read, and words that were fine are left alone', async ({ page }) => {
  await html(page, BAD);
  const fineBefore = await rgb(page, '#fine');
  await press(page, 'Make this page easier');
  expect(ratio(await rgb(page, '#faint'), [255, 255, 255])).toBeGreaterThanOrEqual(7);
  expect(ratio(await rgb(page, '#ondark'), [27, 36, 48])).toBeGreaterThanOrEqual(7);
  expect(await rgb(page, '#fine')).toEqual(fineBefore);
});

test('a faint link stays the colour it was, only darker, and gets a line under it', async ({ page }) => {
  await html(page, BAD);
  await press(page, 'Make this page easier');
  const [r, g, b] = await rgb(page, '#link');
  expect(ratio([r!, g!, b!], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  expect(b!).toBeGreaterThan(r!); // still blue, not turned black
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#link')!).textDecorationLine)).toContain('underline');
});

test('words over a picture are left alone, because the ground behind them is unknown', async ({ page }) => {
  await html(page, BAD);
  const before = await rgb(page, '#onphoto');
  await press(page, 'Make this page easier');
  expect(await rgb(page, '#onphoto')).toEqual(before);
});

test('a button with no words gets a name when the page gives two clues to it', async ({ page }) => {
  await html(page, BAD);
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#cart', 'aria-label')).toMatch(/cart|basket/i);
  expect(await page.getAttribute('#email', 'aria-label')).toBe('Email address');
  expect(await page.getAttribute('#named', 'aria-label')).toBeNull(); // it had words already
});

test('a button it cannot work out is left without a name, never given a guess', async ({ page }) => {
  await html(page, BAD);
  const reply = await press(page, 'Make this page easier');
  expect(await page.getAttribute('#mystery', 'aria-label')).toBeNull();
  expect(reply.said).toMatch(/1 button I couldn't work out/);
});

test('with Gemini, a button the page gives only hints about is named, from hints that carry nothing private', async ({ page }) => {
  await html(page, BAD.replace('js-toggle-x91', 'js-toggle-x91 hamburger')); // one clue: not enough for Milo alone
  await page.evaluate(() => window.__steady.useGemini(async (prompt) => (/hamburger/.test(prompt) ? '{"1": "Open the menu"}' : '{}')));
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#mystery', 'aria-label')).toBe('Open the menu');
  const prompt = await page.evaluate(() => String(window.__steady.calls.find((c) => c.port === 'gemini')?.args[0]));
  expect(prompt).toContain('hamburger');
  expect(prompt).not.toContain('abc123'); // what follows a "?" in an address is never sent
  expect(prompt).not.toContain('fifty dollars'); // nor the words on the page
});

test("Gemini's answer is checked: a long or odd name, or a question mark, is thrown away", async ({ page }) => {
  await html(page, BAD);
  await page.evaluate(() => window.__steady.useGemini(async () => '{"1": "Click here to win a prize now <b>free</b> at http://x.example"}'));
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#mystery', 'aria-label')).toBeNull();
  await page.evaluate(() => window.__steady.easier.undo());
  await page.evaluate(() => window.__steady.useGemini(async () => '{"1": "?"}'));
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#mystery', 'aria-label')).toBeNull();
});

test('the keyboard can be seen again, and things stop moving', async ({ page }) => {
  await html(page, BAD);
  await press(page, 'Make this page easier');
  await page.focus('#named');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.querySelector('#named')!).outlineStyle);
  expect(outline).not.toBe('none');
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect as KeyframeEffect).target?.id === 'spin').length);
  expect(running).toBe(0);
});

test('it says what it did in plain words, and offers to put it back', async ({ page }) => {
  await html(page, BAD);
  const reply = await press(page, 'Make this page easier');
  expect(reply.said).toMatch(/^Done\. I made 3 pieces of faint writing darker/);
  expect(reply.said).toContain('gave 2 buttons and boxes a name');
  expect(reply.said).toContain('stopped 1 thing moving');
  expect(reply.options).toEqual(['Do this on every page', 'Put the page back']);
});

test('"Put the page back" undoes every change', async ({ page }) => {
  await html(page, BAD);
  const before = await page.evaluate(() => document.querySelector('main')!.outerHTML);
  const faint = await rgb(page, '#faint');
  await press(page, 'Make this page easier');
  const reply = await press(page, 'Put the page back');
  expect(reply.said).toBe("I've put the page back the way it was.");
  expect(await page.evaluate(() => document.querySelector('main')!.outerHTML)).toBe(before);
  expect(await rgb(page, '#faint')).toEqual(faint);
  expect(await page.evaluate(() => document.querySelectorAll('style[data-steady-easier]').length)).toBe(0);
});

test('a video with no captions is something it says it cannot fix, with where to get them', async ({ page }) => {
  await html(page, '<main><p style="color:#222">A film about the harbour.</p><video src="harbour.mp4" width="320" height="180"></video></main>');
  const reply = await press(page, 'Make this page easier');
  expect(reply.said).toContain("There's a video here with no captions. I can't add those, but Chrome can: it's called Live Caption");
});

test('a page with nothing wrong is told so, and nothing is touched', async ({ page }) => {
  await html(page, '<main><h1 style="color:#111">Opening hours</h1><p style="color:#222">Nine to five, every day.</p><button>Call us</button></main>');
  const before = await page.evaluate(() => document.body.innerHTML);
  const reply = await press(page, 'Make this page easier');
  expect(reply.said).toBe("I looked this page over and it reads well already. I've made sure you can always see where the keyboard is.");
  expect(await page.evaluate(() => document.body.innerHTML.replace(/<style data-steady-easier[^]*?<\/style>/, ''))).toBe(before);
});

test('"Do this on every page" is remembered, done quietly on the next page, and can be stopped', async ({ page }) => {
  await html(page, BAD);
  await press(page, 'Make this page easier');
  const reply = await press(page, 'Do this on every page');
  expect(reply.said).toBe("I will. From now on I'll do this on every page you open, without a word. Tell me if you want me to stop.");
  expect(reply.options).toEqual(['Stop doing it on every page']);
  // The next page: nothing has been asked, and it is already easier.
  await page.evaluate(() => window.__steady.easier.undo());
  const spokeBefore = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').length);
  await page.evaluate(() => window.__steady.easier.resume());
  expect(ratio(await rgb(page, '#faint'), [255, 255, 255])).toBeGreaterThanOrEqual(7);
  expect(await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').length)).toBe(spokeBefore);
  const stop = await press(page, 'Stop doing it on every page');
  expect(stop.said).toBe("All right. I'll only do it when you ask.");
  await page.evaluate(() => window.__steady.easier.undo());
  await page.evaluate(() => window.__steady.easier.resume());
  expect(await rgb(page, '#faint')).toEqual([184, 184, 184]);
});

test("Milo's own notes and pop-ups are never changed", async ({ page }) => {
  await html(page, BAD + '<div data-steady-ui id="mine"><p id="minep" style="color:#b8b8b8">A note from Milo</p></div>');
  await press(page, 'Make this page easier');
  expect(await rgb(page, '#minep')).toEqual([184, 184, 184]);
});

test('a page that hides its language or blocks zooming has both put right', async ({ page }) => {
  await page.setContent('<!doctype html><html><head><title>t</title><meta name="viewport" content="width=device-width, user-scalable=no, maximum-scale=1"></head><body><main><p style="color:#222">Hello there.</p></main></body></html>');
  await page.addScriptTag({ path: 'tests/.tmp/pagemap.js' });
  await press(page, 'Make this page easier');
  const viewport = await page.getAttribute('meta[name=viewport]', 'content');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\D|$)/);
});

test('the panel offers it, once, on a page that is hard to read, and not on one that is fine', async ({ page }) => {
  const pale = Array.from({ length: 6 }, (_, i) => `<p style="color:#bbbbbb">Pale paragraph number ${i} with enough words to count.</p>`).join('');
  await html(page, `<main>${pale}</main>`);
  const hint = await page.evaluate(() => window.__steady.suggest());
  expect(hint.said).toBe('Some of this page is hard to read. I can make it easier.');
  expect(hint.options[0]).toBe('Make this page easier');
  await press(page, 'Make this page easier');
  expect((await page.evaluate(() => window.__steady.suggest())).said).toBe(''); // already done: nothing to offer
  await html(page, '<main><p style="color:#222">Dark words on a white page, easy to read.</p></main>');
  expect((await page.evaluate(() => window.__steady.suggest())).said).toBe('');
});

test('two clues that agree are enough to name an icon without Gemini; one clue, or two that disagree, is not', async ({ page }) => {
  await html(page, `<main><p style="color:#222">News.</p>
    <button id="two-words" class="nav-toggle hamburger"><svg width="24" height="24"></svg></button>
    <a id="two-places" class="search-link" href="/find?q=1"><svg class="icon-search" width="24" height="24"></svg></a>
    <button id="one" class="btn-heart"><svg width="24" height="24"></svg></button>
    <button id="mixed" class="cart-close"><svg width="24" height="24"></svg></button></main>`);
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#two-words', 'aria-label')).toBe('Open the menu');
  expect(await page.getAttribute('#two-places', 'aria-label')).toBe('Search');
  expect(await page.getAttribute('#one', 'aria-label')).toBeNull();
  expect(await page.getAttribute('#mixed', 'aria-label')).toBeNull();
});

test('a line of news that scrolls past is stopped where all of it can be read, not frozen half off the page', async ({ page }) => {
  await html(page, `<style>.ticker { width: 300px; overflow: hidden; white-space: nowrap; } .ticker span { display: inline-block; padding-left: 100%; animation: slide 8s linear infinite; color: #222; }
    @keyframes slide { to { transform: translateX(-100%); } } .blink { color: #222; animation: blink 1s steps(2) infinite; } @keyframes blink { 50% { opacity: 0; } }</style>
    <main><div class="ticker"><span id="news">Road works on Maple Street from Monday and the library closes early on Friday</span></div><p class="blink" id="blink">Sale ends today</p></main>`);
  await page.waitForTimeout(700); // part-way through, as she would find it
  await press(page, 'Make this page easier');
  const seen = await page.evaluate(() => {
    const news = document.getElementById('news')!.getBoundingClientRect();
    const box = document.querySelector('.ticker')!.getBoundingClientRect();
    return { inside: news.left >= box.left - 1 && news.right <= box.right + 1, blink: Number(getComputedStyle(document.getElementById('blink')!).opacity) };
  });
  expect(seen.inside).toBe(true);
  expect(seen.blink).toBe(1); // something that blinks is never left stopped on "invisible"
});

test('a number shown on an icon stays in its name, and the button beside a search box is the search button', async ({ page }) => {
  await html(page, `<main><p style="color:#222">Shop.</p>
    <a id="basket" class="basket-link" href="/basket"><svg class="icon-basket" width="24" height="24"></svg><span>4</span></a>
    <form><input type="search" name="q" placeholder="Search"><button id="go" type="submit" class="btn-icon"><svg class="icon-search" width="24" height="24"></svg></button></form></main>`);
  await press(page, 'Make this page easier');
  expect(await page.getAttribute('#basket', 'aria-label')).toMatch(/^(Shopping cart|Basket), 4$/); // what she can see is still said (WCAG 2.5.3)
  expect(await page.getAttribute('#go', 'aria-label')).toBe('Search');
});

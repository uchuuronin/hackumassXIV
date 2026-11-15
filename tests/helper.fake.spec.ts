// The advert check reads what a box calls itself. A link whose tooltip happens to contain the word
// "advert" (a GitHub commit message, a news headline) is not an advert.
import { expect, test } from '@playwright/test';
import { html } from './helpers';

const around = (page: import('@playwright/test').Page, id: string) => page.evaluate((i) => !!window.__steady.advertAround(document.getElementById(i)!), id);

test('a sentence in a tooltip that mentions adverts is not an advert', async ({ page }) => {
  await html(page, `<a id="commit" href="/c/1" title="Fake check: at most two advert warnings in all, and only for frames on screen">Fake check: at most two advert warnings</a>
    <a id="news" href="/n" aria-label="Council bans sponsored billboards near schools">Council bans billboards</a>`);
  expect(await around(page, 'commit')).toBe(false);
  expect(await around(page, 'news')).toBe(false);
});

test('a box that really calls itself an advert is still caught', async ({ page }) => {
  await html(page, `<div aria-label="Advertisement"><a id="a1" href="/x">Buy now</a></div>
    <div title="Sponsored"><a id="a2" href="/x">Deal</a></div>
    <div class="top-ad"><a id="a3" href="/x">Click</a></div>
    <div id="sponsored-results"><a id="a4" href="/x">Shop</a></div>
    <div><span>Sponsored</span><a id="a5" href="/x">Offer</a></div>`);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) expect(await around(page, id), id).toBe(true);
});

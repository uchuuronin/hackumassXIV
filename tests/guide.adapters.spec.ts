// The guide lane draws through A's overlay. This checks the small piece that joins the two.
import { expect, test } from '@playwright/test';
import { html, inject, one } from './helpers';

test("labels and the spotlight are passed to A's overlay, follow their button, and are taken down again", async ({ page }) => {
  const map = await html(page, `<button style="margin:200px">Checkout</button>`);
  const id = one(map, 'Checkout').id;
  const log = await page.evaluate((id) => {
    const calls: string[] = [];
    const shown = new Map<string, { where: unknown; label?: string; tone?: string }>();
    const port = window.__steady.adaptOverlay(() => ({
      show: (item) => (shown.set(item.id, item), calls.push(`show ${item.id} "${item.label ?? ''}" ${item.tone}`)),
      hide: (itemId) => (shown.delete(itemId), calls.push(`hide ${itemId}`)),
      clear: () => calls.push('clear'),
      setCursor: () => undefined,
      setDwell: () => undefined,
    }));
    port.labels('choices', [{ targetId: id, text: 'Click this to go ahead and pay.', tone: 'go' }]);
    const where = shown.get(`guide:choices:${id}`)!.where as () => { width: number } | null;
    calls.push(`follows: ${where()!.width > 0}`);
    port.labels('choices', []); // a new set replaces the old one
    port.spotlight({ targetId: id, text: 'This one.' });
    port.spotlight(null);
    port.labels('choices', [{ targetId: id, text: 'Careful.', tone: 'careful' }]);
    port.clear();
    return calls;
  }, id);
  expect(log).toEqual([
    `show guide:choices:${id} "Click this to go ahead and pay." step`,
    'follows: true',
    `hide guide:choices:${id}`,
    `show guide:spotlight "This one." step`,
    'hide guide:spotlight',
    `show guide:choices:${id} "Careful." warning`,
    `hide guide:choices:${id}`,
  ]);
});

test("the spotlight dims the rest of the page through A's overlay, unless a step asks for a ring only", async ({ page }) => {
  const map = await html(page, `<button style="margin:200px">Checkout</button>`);
  const id = one(map, 'Checkout').id;
  const log = await page.evaluate((id) => {
    const calls: string[] = [];
    const port = window.__steady.adaptOverlay(() => ({
      show: (item) => calls.push(`show ${item.id}`),
      hide: (itemId) => calls.push(`hide ${itemId}`),
      clear: () => undefined,
      setCursor: () => undefined,
      setDwell: () => undefined,
      setSpotlight: (where) => calls.push(where === null ? 'dim off' : `dim on, follows: ${(where as () => { width: number } | null)()!.width > 0}`),
    }));
    port.spotlight({ targetId: id, text: 'This one.' });
    port.spotlight(null);
    port.spotlight({ targetId: id, dim: false }); // a box in a form: she still needs to read the others
    port.spotlight(null);
    return calls;
  }, id);
  // A ring-only step also says "dim off", so an earlier dimmed step can never leave the page dark.
  expect(log).toEqual(['show guide:spotlight', 'dim on, follows: true', 'hide guide:spotlight', 'dim off', 'show guide:spotlight', 'dim off', 'hide guide:spotlight', 'dim off']);
});

test('a spotlight on a set of choices covers all of them', async ({ page }) => {
  const map = await html(
    page,
    `<fieldset><legend>Who would you like to see?</legend>
       <label style="display:block;margin:30px"><input type="radio" name="d" value="a"> Dr. Okafor</label>
       <label style="display:block;margin:30px"><input type="radio" name="d" value="b"> Dr. Herrera</label></fieldset>`,
  );
  const ids = map.elements.filter((e) => e.kind === 'radio').map((e) => e.id);
  const covered = await page.evaluate((ids) => {
    let lit: { y: number; height: number } | null = null;
    const port = window.__steady.adaptOverlay(() => ({
      show: () => undefined,
      hide: () => undefined,
      clear: () => undefined,
      setCursor: () => undefined,
      setDwell: () => undefined,
      setSpotlight: (where) => (lit = where === null ? null : (where as () => { y: number; height: number })()),
    }));
    port.spotlight({ targetId: ids[0]!, group: ids });
    const [a, b] = ids.map((id) => window.__steady.api.liveRect(id)!);
    return lit!.y <= a!.y && lit!.y + lit!.height >= b!.y + b!.height;
  }, ids);
  expect(covered).toBe(true);
});

test('a set of choices is lit as whole cards, names included, not only the little circles', async ({ page }) => {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  const covered = await page.evaluate(() => {
    const ids = window.__steady.api
      .get()
      .elements.filter((e) => e.kind === 'radio')
      .map((e) => e.id);
    let lit: { x: number; y: number; width: number; height: number } | null = null;
    const port = window.__steady.adaptOverlay(() => ({
      show: () => undefined,
      hide: () => undefined,
      clear: () => undefined,
      setCursor: () => undefined,
      setDwell: () => undefined,
      setSpotlight: (where) => (lit = where === null ? null : (where as () => typeof lit)()),
    }));
    port.spotlight({ targetId: ids[0]!, group: ids });
    const cards = [...document.querySelectorAll('label.doctor')].map((c) => c.getBoundingClientRect());
    return cards.every((c) => lit!.x <= c.left + 1 && lit!.y <= c.top + 1 && lit!.x + lit!.width >= c.right - 1 && lit!.y + lit!.height >= c.bottom - 1);
  });
  expect(covered).toBe(true);
});

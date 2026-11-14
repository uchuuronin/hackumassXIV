// The guide lane draws through A's overlay. This checks the small piece that joins the two.
import { expect, test } from '@playwright/test';
import { html, one } from './helpers';

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

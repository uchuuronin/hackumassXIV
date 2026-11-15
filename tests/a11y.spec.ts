// Steady is an accessibility tool, so its own screens have to pass too. These are the rules that can
// be checked without a person: text size, the focus ring, staying inside a pop-up, and stopping movement.
// The full sweep (every screen, with axe) is tools/a11y-audit.mjs.
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_ON, GUIDE_SWITCHES, LIGHT, readSwitches } from '../src/shared/guideSwitches';
import { theme } from '../src/shared/theme';
import { html } from './helpers';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(css|ts|tsx)$/.test(name) ? [path] : [];
  });

/** Every text size written anywhere Steady draws something: `font-size: 17px`, `font: 600 17px/1.4 …`, `fontSize: 17`. */
function textSizes(source: string): number[] {
  const sizes: number[] = [];
  for (const m of source.matchAll(/font-size\s*:\s*([\d.]+)px/g)) sizes.push(Number(m[1]));
  for (const m of source.matchAll(/font\s*:\s*[^;}`'\n]*?([\d.]+)px/g)) sizes.push(Number(m[1]));
  for (const m of source.matchAll(/fontSize\s*:\s*['"]?([\d.]+)/g)) sizes.push(Number(m[1]));
  return sizes;
}

test('nothing Steady draws has words smaller than 18 px', () => {
  const small: string[] = [];
  for (const file of [...walk('src'), 'relay/src/family.ts', 'relay/src/stuckMessage.ts']) {
    for (const px of textSizes(readFileSync(file, 'utf8'))) if (px < 18) small.push(`${file}: ${px}px`);
  }
  expect(small).toEqual([]);
});

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('the keyboard focus ring can be seen on light ground and on the navy band', () => {
  // WCAG 1.4.11: a focus ring is a shape, so 3 to 1 against what is next to it.
  expect(contrast(theme.focus, theme.paper)).toBeGreaterThanOrEqual(3);
  expect(contrast(theme.focus, theme.card)).toBeGreaterThanOrEqual(3);
  expect(contrast(theme.focusOnInk, theme.ink)).toBeGreaterThanOrEqual(3);
  const css = readFileSync('src/entrypoints/sidepanel/style.css', 'utf8');
  expect(css, 'the band uses the ring made for dark ground').toMatch(/\.band [^{]*:focus-visible[^{]*\{[^}]*var\(--focus-on-ink\)/);
});

test('the panel still fits when it is very narrow or zoomed in', () => {
  // Two buttons side by side must be allowed to stack (WCAG 1.4.10 and 1.4.4).
  const css = readFileSync('src/entrypoints/sidepanel/style.css', 'utf8');
  for (const rule of ['.row', '.foot']) {
    const body = css.match(new RegExp(`\\${rule} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(body, rule).toContain('auto-fit');
  }
  expect(css.match(/\.who \{([^}]*)\}/)?.[1] ?? '', 'the face and the name').toContain('flex-wrap: wrap');
});

test("Steady's own movement can be switched off, and Keep it light leaves that choice alone", () => {
  // WCAG 2.2.2: anything that keeps moving by itself needs a way to stop it.
  expect(GUIDE_SWITCHES.map((s) => s.id)).toContain('motion');
  expect(ALL_ON.motion).toBe(true);
  expect(LIGHT.motion).toBe(true);
  expect(readSwitches({ motion: false }).motion).toBe(false);
  expect(readSwitches({}).motion).toBe(true);
  const css = readFileSync('src/entrypoints/sidepanel/style.css', 'utf8');
  expect(css).toMatch(/\.app\.still [^{]*\{[^}]*animation: none/);
});

test('Tab stays inside a pop-up until it closes, forwards and backwards', async ({ page }) => {
  await html(page, '<button id="before">On the page</button><div id="host"></div><button id="after">Also on the page</button>');
  await page.evaluate(() => {
    const root = document.getElementById('host')!.attachShadow({ mode: 'closed' });
    root.innerHTML = '<div id="box"><button id="a">Not yet</button><button id="b" disabled>Wait</button><button id="c">Yes</button></div>';
    const w = window as unknown as { release: () => void; where: () => string };
    w.release = window.__steady.keepFocusInside(root.getElementById('box')!);
    w.where = () => root.activeElement?.id ?? `page:${document.activeElement?.id ?? ''}`;
    (root.getElementById('a') as HTMLElement).focus();
  });
  const where = () => page.evaluate(() => (window as unknown as { where: () => string }).where());
  await page.keyboard.press('Tab');
  expect(await where()).toBe('c'); // the switched-off button is passed over
  await page.keyboard.press('Tab');
  expect(await where()).toBe('a'); // round to the start, not out to the page
  await page.keyboard.press('Shift+Tab');
  expect(await where()).toBe('c');
  // Focus that got out some other way is brought back on the next Tab.
  await page.evaluate(() => document.getElementById('before')!.focus());
  await page.keyboard.press('Tab');
  expect(await where()).toBe('a');
  // After it closes, Tab is the page's again.
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  expect(await where()).toBe('a');
  await page.keyboard.press('Shift+Tab'); // from the first button, backwards: out to the page
  expect(await where()).toBe('page:before');
});

test('a pop-up says its name and gives focus back where it came from', async ({ page }) => {
  await html(page, '<button id="pay">Place order</button><div id="host"></div>');
  await page.evaluate(() => {
    const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="box" role="alertdialog" aria-modal="true"><h2>Check before you pay</h2><p>This will take money.</p><button id="a">Not yet</button></div>';
    document.getElementById('pay')!.focus();
    const box = root.getElementById('box')!;
    const w = window as unknown as { close: () => void };
    w.close = window.__steady.openDialog(box, { title: box.querySelector('h2')!, about: box.querySelector('p')!, first: root.getElementById('a')! });
  });
  const box = page.locator('#box');
  await expect(box).toHaveAttribute('aria-labelledby', /.+/);
  await expect(box).toHaveAttribute('aria-describedby', /.+/);
  expect(await page.evaluate(() => document.getElementById('host')!.shadowRoot!.activeElement?.id)).toBe('a');
  await page.evaluate(() => (window as unknown as { close: () => void }).close());
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('pay');
});

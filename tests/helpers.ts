import type { Page } from '@playwright/test';
import type { AutoClickVerdict, ModelSafeMap, PageElement, PageMap } from '../src/shared/pagemap';

/** Put the page map into the page, as the content script would. */
export async function inject(page: Page): Promise<void> {
  const already = await page.evaluate(() => '__steady' in window);
  if (!already) await page.addScriptTag({ path: 'tests/.tmp/pagemap.js' });
}

export async function open(page: Page, url: string): Promise<PageMap> {
  await page.goto(url);
  return getMap(page);
}

export async function html(page: Page, body: string): Promise<PageMap> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Test page</title></head><body>${body}</body></html>`);
  return getMap(page);
}

export async function getMap(page: Page): Promise<PageMap> {
  await inject(page);
  return page.evaluate(() => window.__steady.api.get());
}

export async function modelSafe(page: Page): Promise<ModelSafeMap> {
  await inject(page);
  return page.evaluate(() => window.__steady.toModelSafe(window.__steady.api.get()));
}

/** Ask the safety limit about the element matching a CSS selector. */
export async function mayAutoClick(page: Page, selector: string): Promise<AutoClickVerdict> {
  await inject(page);
  return page.evaluate((sel) => window.__steady.api.mayAutoClick(document.querySelector(sel)!), selector);
}

export function byLabel(map: PageMap, label: string | RegExp): PageElement[] {
  return map.elements.filter((e) => e.visible && (typeof label === 'string' ? e.label === label : label.test(e.label)));
}

export function one(map: PageMap, label: string | RegExp): PageElement {
  const found = byLabel(map, label);
  if (found.length !== 1) {
    throw new Error(`Expected one visible element labelled ${label}, found ${found.length}: ${found.map((f) => f.label).join(', ')}`);
  }
  return found[0]!;
}

// Steady scrolling: the filter with no browser, then the wheel handler in a real page.
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { ScrollFilter } from '../src/hands/scroll/scrollFilter';

test('forwards movements pass, and a big jolt is capped', () => {
  const f = new ScrollFilter();
  expect(f.accept(0, 100)).toBe(100);
  expect(f.accept(20, 120)).toBe(120);
  expect(f.accept(40, 900)).toBe(f.maxStepPx);
  expect(f.accept(60, -0)).toBe(0);
});

test('a small flick back straight after a movement forwards is dropped', () => {
  const f = new ScrollFilter();
  expect(f.accept(0, 80)).toBe(80);
  expect(f.accept(40, -12)).toBe(0);
  expect(f.accept(80, 60)).toBe(60); // and the way forward carries on
});

test('a big movement the other way is meant, so it is kept', () => {
  const f = new ScrollFilter();
  f.accept(0, 80);
  expect(f.accept(40, -f.reversalPx)).toBe(-f.reversalPx);
});

test('a small movement the other way after a pause is meant, so it is kept', () => {
  const f = new ScrollFilter();
  f.accept(0, 80);
  expect(f.accept(f.reversalMs + 1, -10)).toBe(-10);
});

test('a dropped flick does not push the clock forward', () => {
  const f = new ScrollFilter();
  f.accept(0, 80);
  expect(f.accept(200, -10)).toBe(0);
  expect(f.accept(300, -10)).toBe(-10); // 300 ms after the last kept one
});

test('rubbish is dropped', () => {
  const f = new ScrollFilter();
  expect(f.accept(0, NaN)).toBe(0);
  expect(f.accept(0, Infinity)).toBe(0);
});

// ---- in a real page ----

test.describe('in a page', () => {
  test.beforeAll(async () => {
    await build({
      stdin: {
        contents: `import { startSteadyScroll } from './src/hands/scroll/startSteadyScroll';
          const stops: (() => void)[] = [];
          (window as any).__scroll = startSteadyScroll({ onStop: (f: () => void) => stops.push(f) } as any);`,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      format: 'iife',
      alias: { '@': './src' },
      outfile: 'tests/.tmp/scroll.js',
      logLevel: 'warning',
    });
  });

  const PAGE = `<!doctype html><html><body style="margin:0">
    <div style="height:5000px">tall page</div>
    <div id="box" style="position:fixed;top:0;right:0;width:200px;height:200px;overflow:auto"><div style="height:2000px">inner</div></div>
  </body></html>`;

  test('off by default: the page scrolls as the browser likes', async ({ page }) => {
    await page.setContent(PAGE);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).__scroll.dropped())).toBe(0);
  });

  test('on: the page glides to where it is going', async ({ page }) => {
    await page.setContent(PAGE);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.evaluate(() => (window as any).__scroll.setEnabled(true));
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 200);
    await page.waitForFunction(() => Math.abs(scrollY - 200) < 1, undefined, { timeout: 3000 });
  });

  test('on: a jolt is capped and a small flick back is ignored', async ({ page }) => {
    await page.setContent(PAGE);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.evaluate(() => (window as any).__scroll.setEnabled(true));
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 900);
    await page.mouse.wheel(0, -10); // the flick back, straight after
    await page.waitForFunction(() => Math.abs(scrollY - 240) < 1, undefined, { timeout: 3000 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(240, 0);
    expect(await page.evaluate(() => (window as any).__scroll.dropped())).toBe(1);
  });

  test('on: a crooked movement does not drift sideways', async ({ page }) => {
    await page.setContent(`<!doctype html><body style="margin:0"><div style="height:5000px;width:5000px">wide</div></body>`);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.evaluate(() => (window as any).__scroll.setEnabled(true));
    await page.mouse.move(300, 300);
    await page.mouse.wheel(30, 150);
    await page.waitForFunction(() => Math.abs(scrollY - 150) < 1, undefined, { timeout: 3000 });
    expect(await page.evaluate(() => scrollX)).toBe(0);
  });

  test('on: a scrolling box under the pointer scrolls, not the page behind it', async ({ page }) => {
    await page.setContent(PAGE);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.evaluate(() => (window as any).__scroll.setEnabled(true));
    await page.mouse.move(1100, 100);
    await page.mouse.wheel(0, 150);
    await page.waitForFunction(() => Math.abs(document.getElementById('box')!.scrollTop - 150) < 1, undefined, { timeout: 3000 });
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test('on: at the bottom of a box the page takes over, and zoom-scrolling is left alone', async ({ page }) => {
    await page.setContent(PAGE);
    await page.addScriptTag({ path: 'tests/.tmp/scroll.js' });
    await page.evaluate(() => {
      (window as any).__scroll.setEnabled(true);
      const box = document.getElementById('box')!;
      box.scrollTop = box.scrollHeight;
    });
    await page.mouse.move(1100, 100);
    await page.mouse.wheel(0, 150);
    await page.waitForFunction(() => scrollY > 100, undefined, { timeout: 3000 });
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 150);
    await page.keyboard.up('Control');
    expect(await page.evaluate(() => (window as any).__scroll.dropped())).toBe(0);
  });
});

// Dwell click timing, tested with no browser.
import { expect, test } from '@playwright/test';
import { DwellTimer } from '../src/hands/dwell/dwellTimer';

const at = (x: number, y = 0) => ({ x, y });
const timer = () => new DwellTimer({ dwellMs: 1000, holdPx: 12 });

test('the ring fills while the pointer stays on a button, then clicks once', () => {
  const t = timer();
  expect(t.update('a', at(0), 0)).toEqual({ progress: 0, fire: false });
  expect(t.update('a', at(0), 500).progress).toBeCloseTo(0.5, 5);
  expect(t.update('a', at(0), 999).fire).toBe(false);
  expect(t.update('a', at(0), 1000)).toEqual({ progress: 1, fire: true });
});

test('holding still after the click never clicks again', () => {
  const t = timer();
  t.update('a', at(0), 0);
  t.update('a', at(0), 1000);
  for (let ms = 1100; ms < 6000; ms += 100) expect(t.update('a', at(0), ms)).toEqual({ progress: 0, fire: false });
});

test('leaving the button empties the ring and starts over on return', () => {
  const t = timer();
  t.update('a', at(0), 0);
  expect(t.update('a', at(0), 600).progress).toBeGreaterThan(0.5);
  expect(t.update(null, at(50), 700)).toEqual({ progress: 0, fire: false });
  expect(t.update('a', at(0), 800).progress).toBe(0);
  expect(t.update('a', at(0), 1700).fire).toBe(false);
  expect(t.update('a', at(0), 1800).fire).toBe(true);
});

test('moving to a different button starts the count again', () => {
  const t = timer();
  t.update('a', at(0), 0);
  t.update('a', at(0), 800);
  expect(t.update('b', at(60), 900).progress).toBe(0);
  expect(t.update('b', at(60), 1899).fire).toBe(false);
  expect(t.update('b', at(60), 1900).fire).toBe(true);
});

test('small drift is fine, a big move on the same button starts again', () => {
  const t = timer();
  t.update('a', at(0), 0);
  expect(t.update('a', at(8), 600).progress).toBeCloseTo(0.6, 5); // inside 12 px: keeps filling
  expect(t.update('a', at(40), 700).progress).toBe(0); // moved a long way: starts again
  expect(t.update('a', at(40), 1600).fire).toBe(false);
  expect(t.update('a', at(40), 1700).fire).toBe(true);
});

test('a real click by hand stops a dwell click on that button', () => {
  const t = timer();
  t.update('a', at(0), 0);
  t.update('a', at(0), 500);
  t.pressedForReal();
  for (let ms = 600; ms < 3000; ms += 100) expect(t.update('a', at(0), ms).fire).toBe(false);
  // leaving and coming back works again
  t.update(null, at(0), 3100);
  t.update('a', at(0), 3200);
  expect(t.update('a', at(0), 4200).fire).toBe(true);
});

test('the hold time can be changed', () => {
  const t = new DwellTimer({ dwellMs: 600, holdPx: 12 });
  t.update('a', at(0), 0);
  expect(t.update('a', at(0), 599).fire).toBe(false);
  expect(t.update('a', at(0), 600).fire).toBe(true);
});

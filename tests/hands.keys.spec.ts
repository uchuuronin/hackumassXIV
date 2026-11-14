// The double-key guard, tested with no browser.
import { expect, test } from '@playwright/test';
import { KeyGuard, type KeyHit } from '../src/hands/keys/keyGuard';

const hit = (code: string, t: number, extra: Partial<KeyHit> = {}): KeyHit => ({ code, key: code.replace('Key', '').toLowerCase(), t, repeat: false, shortcut: false, ...extra });

test('off by default: nothing is dropped', () => {
  const g = new KeyGuard();
  expect(g.shouldDrop(hit('KeyL', 0))).toBe(false);
  expect(g.shouldDrop(hit('KeyL', 5))).toBe(false);
});

test('a key hit twice inside the guard time is dropped once', () => {
  const g = new KeyGuard(120);
  expect(g.shouldDrop(hit('KeyL', 1000))).toBe(false);
  expect(g.shouldDrop(hit('KeyL', 1050))).toBe(true);
});

test('the same key after the guard time is typed (a real double letter)', () => {
  const g = new KeyGuard(120);
  expect(g.shouldDrop(hit('KeyL', 1000))).toBe(false);
  expect(g.shouldDrop(hit('KeyL', 1200))).toBe(false);
});

test('a different key straight after is typed', () => {
  const g = new KeyGuard(120);
  expect(g.shouldDrop(hit('KeyL', 1000))).toBe(false);
  expect(g.shouldDrop(hit('KeyO', 1030))).toBe(false);
});

test('a dropped hit does not push the clock forward', () => {
  const g = new KeyGuard(120);
  expect(g.shouldDrop(hit('KeyL', 1000))).toBe(false);
  expect(g.shouldDrop(hit('KeyL', 1100))).toBe(true);
  expect(g.shouldDrop(hit('KeyL', 1130))).toBe(false); // 130 ms after the one that was typed
});

test('held keys, shortcuts and non-letter keys are left alone', () => {
  const g = new KeyGuard(120);
  g.shouldDrop(hit('KeyL', 1000));
  expect(g.shouldDrop(hit('KeyL', 1010, { repeat: true }))).toBe(false);
  expect(g.shouldDrop(hit('KeyL', 1020, { shortcut: true }))).toBe(false);
  expect(g.shouldDrop({ code: 'Backspace', key: 'Backspace', t: 1030, repeat: false, shortcut: false })).toBe(false);
  expect(g.shouldDrop({ code: 'Backspace', key: 'Backspace', t: 1040, repeat: false, shortcut: false })).toBe(false);
});

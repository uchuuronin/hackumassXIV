// The sums behind Big Pick, tested with no browser.
import { expect, test } from '@playwright/test';
import { isoDay, monthGrid, monthHasDays, movePage, pageFor, parseIso, shiftMonth, stepNumber } from '../src/hands/bigpick/logic';

test('a long list opens on the page with the chosen one', () => {
  expect(pageFor(90, 12, 0).index).toBe(0);
  expect(pageFor(90, 12, 30).index).toBe(2);
  expect(pageFor(90, 12, 89).index).toBe(7);
  expect(pageFor(90, 12, -1).index).toBe(0);
  expect(pageFor(5, 12, 3).pages).toBe(1);
});

test('paging stays inside the list', () => {
  const p = pageFor(30, 12, 0);
  expect(movePage(p, 30, 12, -1).index).toBe(0);
  const last = movePage(movePage(p, 30, 12, 1), 30, 12, 5);
  expect(last.index).toBe(2);
  expect(last.to).toBe(30);
});

test('dates are written the way a date field wants them', () => {
  expect(isoDay(2026, 10, 5)).toBe('2026-11-05');
  expect(parseIso('2026-11-05')?.month).toBe(10);
  expect(parseIso('2026-02-31')).toBeNull();
  expect(parseIso('')).toBeNull();
});

test('a month has the right days and starts on the right weekday', () => {
  const weeks = monthGrid(2026, 10); // November 2026 starts on a Sunday
  expect(weeks[0]?.[0]?.day).toBe(1);
  expect(weeks.flat().filter((d) => d).length).toBe(30);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
  const feb = monthGrid(2028, 1); // leap year
  expect(feb.flat().filter((d) => d).length).toBe(29);
});

test('days outside min and max are switched off', () => {
  const days = monthGrid(2026, 10, '2026-11-10', '2026-11-20').flat().filter((d) => d);
  expect(days.filter((d) => d && !d.disabled).length).toBe(11);
  expect(monthHasDays(2026, 9, '2026-11-10', '2026-11-20')).toBe(false);
  expect(monthHasDays(2026, 10, '2026-11-10', '2026-11-20')).toBe(true);
});

test('moving across a year end', () => {
  expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
});

test('number steps stay inside the limits and stay tidy', () => {
  expect(stepNumber(5, 1, 1, 0, 10)).toBe(6);
  expect(stepNumber(10, 1, 1, 0, 10)).toBe(10);
  expect(stepNumber(0, -1, 1, 0, 10)).toBe(0);
  expect(stepNumber(0.1, 1, 0.1, 0, 1)).toBe(0.2);
  expect(stepNumber(0.2, 1, 0.1, 0, 1)).toBe(0.3);
  expect(stepNumber(3, 1, 5, 0, 20)).toBe(5);
  expect(stepNumber(4, 1, 1)).toBe(5);
});

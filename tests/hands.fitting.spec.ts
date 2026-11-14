// Reading a tremor from a follow-the-dot run, tested with made-up runs. No browser.
import { expect, test } from '@playwright/test';
import { analyseTremor, settingsFromReading, type FollowSample } from '../src/hands/fitting/analysis';

/** A slow dot, a pointer that follows it a little late, plus a shake of `hz` and `amp` px. Samples come at an uneven ~60 Hz. */
function run(options: { seconds?: number; hz?: number; amp?: number; noise?: number }): FollowSample[] {
  const { seconds = 14, hz = 6.5, amp = 3, noise = 0.4 } = options;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const out: FollowSample[] = [];
  for (let t = 0; t < seconds * 1000; t += 14 + Math.round(rand() * 6)) {
    const s = t / 1000;
    const dotX = 900 + 500 * Math.sin((2 * Math.PI * s) / 9);
    const dotY = 450 + 250 * Math.sin((2 * Math.PI * s) / 7 + 1);
    const lagX = 900 + 500 * Math.sin((2 * Math.PI * (s - 0.15)) / 9);
    const lagY = 450 + 250 * Math.sin((2 * Math.PI * (s - 0.15)) / 7 + 1);
    out.push({
      t,
      dotX,
      dotY,
      x: Math.round(lagX + amp * Math.sin(2 * Math.PI * hz * s) + noise * rand() * 2),
      y: Math.round(lagY + amp * 0.7 * Math.sin(2 * Math.PI * hz * s + 1) + noise * rand() * 2),
    });
  }
  return out;
}

test('finds the shake speed and size of a made-up tremor', () => {
  for (const hz of [4.5, 6, 7.5, 9]) {
    const reading = analyseTremor(run({ hz, amp: 3 }))!;
    expect(Math.abs(reading.hz - hz)).toBeLessThanOrEqual(0.5);
    expect(reading.amplitudePx).toBeGreaterThan(2);
    expect(reading.amplitudePx).toBeLessThan(5);
    expect(reading.clarity).toBeGreaterThan(3);
  }
});

test('a bigger shake gives a bigger size and a wider reach', () => {
  const small = analyseTremor(run({ amp: 1.5 }))!;
  const big = analyseTremor(run({ amp: 6 }))!;
  expect(big.amplitudePx).toBeGreaterThan(small.amplitudePx * 2);
  expect(settingsFromReading(big).reach).toBeGreaterThan(settingsFromReading(small).reach);
});

test('a steady hand has no clear tremor, so the shake speed is left alone', () => {
  const reading = analyseTremor(run({ amp: 0, noise: 0.5 }))!;
  expect(settingsFromReading(reading).tremorHz).toBeUndefined();
});

test('too short a run gives no reading', () => {
  expect(analyseTremor(run({ seconds: 2 }))).toBeNull();
});

test('reach stays between 16 and 40 px', () => {
  expect(settingsFromReading({ hz: 6, amplitudePx: 0, clarity: 10, seconds: 12 }).reach).toBe(16);
  expect(settingsFromReading({ hz: 6, amplitudePx: 50, clarity: 10, seconds: 12 }).reach).toBe(40);
});

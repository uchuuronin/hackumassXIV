// The tremor filter, tested with no browser: a made-up shaking hand goes in, a steadier one comes out.
import { expect, test } from '@playwright/test';
import { PointerFilter } from '../src/hands/filter/pointerFilter';

/** A hand moving at `speed` px/s along x, with a shake of `amp` px at `hz`, sampled at `rate` events a second. */
function simulate(hz: number, amp: number, speed: number, rate = 100, options = {}) {
  const filter = new PointerFilter({ tremorHz: 6, ...options });
  const errors: number[] = [];
  for (let i = 0; i <= 3 * rate; i++) {
    const t = i / rate;
    const ideal = speed * t;
    const out = filter.filter(ideal + amp * Math.sin(2 * Math.PI * hz * t), 300, t * 1000);
    if (t > 1) errors.push(out.x - ideal);
  }
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rms = Math.sqrt(errors.map((e) => (e - mean) ** 2).reduce((a, b) => a + b, 0) / errors.length);
  return { shake: rms, lag: -mean };
}

const RAW = 6 / Math.SQRT2; // shake left in a raw 6 px sine

// The fitting measures the shake. Allow it to be half a hertz out.
const fitted = (hz: number) => ({ tremorHz: hz + 0.5 });

test('a still hand with a shake at the fitted frequency comes out almost still', () => {
  expect(simulate(6, 6, 0, 100, { tremorHz: 6 }).shake).toBeLessThan(RAW * 0.1);
});

test('shake from 4 to 12 Hz, still hand: cut by at least three quarters', () => {
  for (const hz of [4, 5, 6, 8, 10, 12]) {
    expect(simulate(hz, 6, 0, 100, fitted(hz)).shake, `${hz} Hz`).toBeLessThan(RAW * 0.25);
  }
});

test('shake from 4 to 12 Hz, slow-moving hand: cut by at least 40 percent', () => {
  for (const hz of [4, 5, 6, 8, 10, 12]) {
    expect(simulate(hz, 6, 100, 100, fitted(hz)).shake, `${hz} Hz`).toBeLessThan(RAW * 0.6);
  }
});

test('a deliberate move does not trail far behind the hand', () => {
  expect(simulate(6, 0, 400).lag).toBeLessThan(8); // px, about 20 ms
  expect(simulate(6, 0, 1000).lag).toBeLessThan(15);
});

test('with no shake, a slow steady move comes out where it went', () => {
  expect(simulate(6, 0, 100).lag).toBeLessThan(3);
});

test('the pointer lands where the hand stops', () => {
  const f = new PointerFilter();
  let last = { x: 0, y: 0 };
  for (let i = 0; i < 300; i++) last = f.filter(200, 120, i * 10);
  expect(last.x).toBeCloseTo(200, 0);
  expect(last.y).toBeCloseTo(120, 0);
});

test('after a pause it starts fresh and does not glide in from the old spot', () => {
  const f = new PointerFilter();
  for (let i = 0; i < 100; i++) f.filter(10, 10, i * 10);
  const first = f.filter(900, 700, 5000);
  expect(first.x).toBe(900);
  expect(first.y).toBe(700);
});

test('uneven event timing does not break it', () => {
  const f = new PointerFilter();
  let t = 0;
  for (let i = 0; i < 500; i++) {
    t += i % 3 === 0 ? 2 : i % 5 === 0 ? 40 : 8;
    const out = f.filter(300, 300, t);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
  }
});

test('a big, fast shake with uneven event timing never comes out bigger than it went in', () => {
  for (const hz of [2, 3, 5, 8, 12]) {
    for (const amp of [20, 100]) {
      const f = new PointerFilter();
      let t = 0;
      let seed = 7;
      const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let rawMin = Infinity, rawMax = -Infinity, outMin = Infinity, outMax = -Infinity;
      while (t < 4000) {
        t += 2 + next() * 14; // events 2 to 16 ms apart, as a real mouse sends them
        const raw = 400 + amp * Math.sin((2 * Math.PI * hz * t) / 1000);
        const out = f.filter(raw, 300, t);
        if (t > 1000) {
          rawMin = Math.min(rawMin, raw); rawMax = Math.max(rawMax, raw);
          outMin = Math.min(outMin, out.x); outMax = Math.max(outMax, out.x);
        }
      }
      expect(outMax - outMin, `${hz} Hz, ${amp} px`).toBeLessThan((rawMax - rawMin) * 1.02);
    }
  }
});

// Where labels go, tested with no browser.
import { expect, test } from '@playwright/test';
import { layoutLabels, leaderLine, type LabelRequest } from '../src/hands/layout';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const VIEW = { width: 1180, height: 820 };
const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Six stacked buttons down the right side of the page, like the demo basket. */
const column = Array.from({ length: 6 }, (_, i) => box(820, 120 + i * 44, 260, 32));
const requests = (): LabelRequest[] => column.map((target, i) => ({ id: `b${i}`, target, width: 240, height: 56 }));

test('six labels at once: none covers another, none covers a button, all are on screen', () => {
  const places = layoutLabels(requests(), column, VIEW);
  expect(places.size).toBe(6);
  const all = [...places.values()];
  all.forEach((a, i) => {
    all.slice(i + 1).forEach((b) => expect(hit(a, b)).toBe(false));
    column.forEach((t) => expect(hit(a, t)).toBe(false));
    expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= VIEW.width && a.y + a.height <= VIEW.height).toBe(true);
  });
});

test('a label avoids a page element beside its target when there is clean space elsewhere', () => {
  const target = box(500, 400, 120, 36);
  const neighbour = box(630, 396, 200, 44); // directly to the right
  const place = layoutLabels([{ id: 'x', target, width: 200, height: 50 }], [neighbour, target], VIEW).get('x')!;
  expect(hit(place, neighbour)).toBe(false);
  expect(hit(place, target)).toBe(false);
});

test('with nothing in the way, a label sits right beside its target', () => {
  const target = box(500, 400, 120, 36);
  const place = layoutLabels([{ id: 'x', target, width: 200, height: 50 }], [], VIEW).get('x')!;
  expect(Math.abs(place.x - (target.x + target.width)) <= 12 || Math.abs(place.y - (target.y + target.height)) <= 12 || Math.abs(target.x - (place.x + place.width)) <= 12 || Math.abs(target.y - (place.y + place.height)) <= 12).toBe(true);
});

test('a label stays where it was while that is still a good place', () => {
  const first = layoutLabels(requests(), column, VIEW);
  const again = layoutLabels(requests().map((r) => ({ ...r, previous: first.get(r.id) })), column, VIEW);
  for (const [id, rect] of first) expect(again.get(id)).toEqual(rect);
});

test('a label near the edge of the screen still ends up on screen', () => {
  const place = layoutLabels([{ id: 'x', target: box(1100, 790, 60, 24), width: 220, height: 50 }], [], VIEW).get('x')!;
  expect(place.x >= 0 && place.y >= 0 && place.x + place.width <= VIEW.width && place.y + place.height <= VIEW.height).toBe(true);
});

test('in a space with no room at all it still places every label', () => {
  const tiny = { width: 200, height: 120 };
  const places = layoutLabels(requests().slice(0, 3).map((r, i) => ({ ...r, target: box(20, 10 + i * 30, 100, 24) })), [], tiny);
  expect(places.size).toBe(3);
});

test('a line back to the target only when the label sits further away', () => {
  const target = box(100, 100, 100, 30);
  expect(leaderLine(target, box(100, 138, 120, 40))).toBeNull(); // right beside it
  expect(leaderLine(target, box(100, 260, 120, 40))).not.toBeNull(); // far below
});

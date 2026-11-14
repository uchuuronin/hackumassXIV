// Where do the labels go? Owner: A. Pure geometry, no page access, so it is easy to test.
// Rules (the plan's interface rules): a label sits in empty space next to its target, never on top of
// the page's buttons, never on top of another label, and on screen. Closest clean spot wins; a label
// that has to go further out gets a thin line back to its target (drawn by the overlay).

import type { Rect } from '@/shared/pagemap';

export interface LabelRequest {
  id: string;
  /** The box the label is about, in viewport pixels. */
  target: Rect;
  /** The size of the label itself. */
  width: number;
  height: number;
  /** Where it was last time. A label stays put unless there is a clearly better place. */
  previous?: Rect;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Space kept between a label and its target when it sits right beside it. */
export const NEAR = 8;
const GAPS = [NEAR, 40, 90, 160, 250];
const EDGE = 4;
/** How much a label counts as "worse" for covering each kind of thing. Scaled by how much of the label is covered. */
const COVER_LABEL = 1500;
const COVER_TARGET = 1500;
const COVER_PAGE = 300;
const OFF_SCREEN = 5000;
/** A label keeps its old place unless a new place is better by more than this. */
const STAY = 25;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

/** The places to try for one label, nearest first. */
function candidates(req: LabelRequest): Array<{ rect: Rect; gap: number }> {
  const t = req.target;
  const { width: w, height: h } = req;
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const out: Array<{ rect: Rect; gap: number }> = [];
  for (const gap of GAPS) {
    const right = t.x + t.width + gap;
    const left = t.x - w - gap;
    const below = t.y + t.height + gap;
    const above = t.y - h - gap;
    const spots: Array<[number, number]> = [
      [right, cy - h / 2],
      [left, cy - h / 2],
      [cx - w / 2, below],
      [cx - w / 2, above],
      [t.x, below],
      [t.x + t.width - w, below],
      [t.x, above],
      [t.x + t.width - w, above],
      [right, below],
      [left, below],
      [right, above],
      [left, above],
    ];
    for (const [x, y] of spots) out.push({ rect: { x, y, width: w, height: h }, gap });
  }
  return out;
}

/**
 * Place every label. `obstacles` are the page's buttons, links, fields, prices and frames that a label
 * must not cover. Labels are placed in reading order. Returns a place for every request: when no clean
 * place exists, the least bad one.
 */
export function layoutLabels(requests: LabelRequest[], obstacles: Rect[], viewport: Viewport): Map<string, Rect> {
  const order = [...requests].sort((a, b) => a.target.y - b.target.y || a.target.x - b.target.x);
  const targets = requests.map((r) => grow(r.target, 4)); // the drawn box is a little bigger than its target
  const placed: Rect[] = [];
  const result = new Map<string, Rect>();

  for (const req of order) {
    const area = Math.max(req.width * req.height, 1); // never zero, or every cost turns into NaN
    const costOf = (rect: Rect, gap: number): number => {
      let cost = gap * 0.4;
      if (rect.x < EDGE || rect.y < EDGE || rect.x + rect.width > viewport.width - EDGE || rect.y + rect.height > viewport.height - EDGE) cost += OFF_SCREEN;
      for (const t of targets) cost += (COVER_TARGET * overlapArea(rect, t)) / area;
      for (const p of placed) cost += (COVER_LABEL * overlapArea(rect, p)) / area;
      for (const o of obstacles) cost += (COVER_PAGE * overlapArea(rect, o)) / area;
      return cost;
    };

    let best: { rect: Rect; cost: number } | undefined;
    for (const [index, c] of candidates(req).entries()) {
      const cost = costOf(c.rect, c.gap) + index * 0.01;
      if (!best || cost < best.cost) best = { rect: c.rect, cost };
    }
    if (!best) continue;
    // Stay where it was, if that is still nearly as good.
    if (req.previous) {
      const prev = { x: req.previous.x, y: req.previous.y, width: req.width, height: req.height };
      if (costOf(prev, 0) <= best.cost + STAY) best = { rect: prev, cost: 0 };
    }
    placed.push(best.rect);
    result.set(req.id, best.rect);
  }
  return result;
}

/** A thin line from a label to its target, from the edge of one to the edge of the other. Null if they are close. */
export function leaderLine(target: Rect, label: Rect): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const lx = clamp(target.x + target.width / 2, label.x, label.x + label.width);
  const ly = clamp(target.y + target.height / 2, label.y, label.y + label.height);
  const tx = clamp(lx, target.x, target.x + target.width);
  const ty = clamp(ly, target.y, target.y + target.height);
  if (Math.hypot(lx - tx, ly - ty) < NEAR + 4) return null;
  return { from: { x: lx, y: ly }, to: { x: tx, y: ty } };
}

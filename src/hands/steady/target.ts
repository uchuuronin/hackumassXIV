// Which button did the person mean? Pure geometry, no page access, so it is easy to test.

import type { Rect } from '@/shared/pagemap';
import type { Point } from '../filter/pointerFilter';

export interface Candidate {
  id: string;
  rect: Rect;
}

export interface Pick {
  id: string;
  /** 0 when the point is inside the button. */
  distance: number;
}

/** How far from a button's edge a click may land and still go to it, in CSS pixels. */
export const DEFAULT_REACH = 20;
/** If two buttons are about equally near, Steady does not guess. A missed click is better than a wrong one. */
export const AMBIGUOUS_MARGIN = 6;

export function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

const area = (r: Rect) => r.width * r.height;

export function pickNearest(p: Point, candidates: Candidate[], reach: number = DEFAULT_REACH): Pick | null {
  let inside: Candidate | undefined;
  const near: Pick[] = [];
  for (const c of candidates) {
    const distance = distanceToRect(p, c.rect);
    if (distance === 0) {
      // Several can contain the point (a link inside a button). The smallest is the one meant.
      if (!inside || area(c.rect) < area(inside.rect)) inside = c;
    } else if (distance <= reach) {
      near.push({ id: c.id, distance });
    }
  }
  if (inside) return { id: inside.id, distance: 0 };
  near.sort((a, b) => a.distance - b.distance);
  const [best, second] = near;
  if (!best) return null;
  if (second && second.distance - best.distance < AMBIGUOUS_MARGIN) return null;
  return best;
}

// The pointer tracker. Owner: A.
// The ONLY code that listens to raw pointer movement. B and C subscribe with `onMove`.
// It runs the tremor filter on every move, and keeps the steadied point settling after the hand
// stops, so a click that comes a moment later is judged from where the hand meant to be.

import type { LaneContext } from '@/shared/lanes';
import { PointerFilter, type Point } from './filter/pointerFilter';

export interface PointerSample {
  raw: Point;
  steady: Point;
}

export interface PointerTracker {
  /** The tremor filter in use. Tuning changes its options. */
  readonly filter: PointerFilter;
  /** Where the real pointer is, or null before it has moved on this page. */
  raw(): Point | null;
  /** Where the steadied pointer is, or null before it has moved. */
  steady(): Point | null;
  /** Called on every move and while the steadied point settles. Returns a function that stops listening. */
  onMove(listener: (sample: PointerSample) => void): () => void;
}

/** After the last move, keep feeding the filter this long, or until it has caught up. */
const SETTLE_MS = 800;
/** Quiet this long counts as "the pointer has stopped moving". */
const QUIET_MS = 40;
const CAUGHT_UP_PX = 0.4;

export function startPointer(ctx: LaneContext): PointerTracker {
  const filter = new PointerFilter();
  const listeners = new Set<(sample: PointerSample) => void>();
  let raw: Point | null = null;
  let steady: Point | null = null;
  let lastEventAt = 0;
  let frame = 0;

  const tell = () => {
    if (!raw || !steady) return;
    for (const listener of listeners) listener({ raw, steady });
  };

  const settle = () => {
    frame = 0;
    if (!raw) return;
    const now = performance.now();
    if (now - lastEventAt > SETTLE_MS) return;
    if (now - lastEventAt > QUIET_MS) {
      steady = filter.filter(raw.x, raw.y, now);
      tell();
      if (Math.hypot(steady.x - raw.x, steady.y - raw.y) < CAUGHT_UP_PX) return;
    }
    frame = requestAnimationFrame(settle);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    let next = steady ?? { x: event.clientX, y: event.clientY };
    for (const s of coalesced.length ? coalesced : [event]) next = filter.filter(s.clientX, s.clientY, s.timeStamp);
    raw = { x: event.clientX, y: event.clientY };
    steady = next;
    lastEventAt = performance.now();
    tell();
    if (!frame) frame = requestAnimationFrame(settle);
  };

  window.addEventListener('pointermove', onMove, true);
  ctx.onStop(() => {
    window.removeEventListener('pointermove', onMove, true);
    if (frame) cancelAnimationFrame(frame);
    listeners.clear();
  });

  return {
    filter,
    raw: () => raw,
    steady: () => steady,
    onMove(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

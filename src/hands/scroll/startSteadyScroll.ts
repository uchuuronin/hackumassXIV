// Puts steady scrolling on the page. Owner: A.
// Wheel and trackpad movements are filtered (see ScrollFilter), only the main direction is used (a
// slightly crooked movement no longer drifts sideways), and the page glides to where it is going
// instead of jumping. Off until the person (or the fitting) turns it on.

import type { LaneContext } from '@/shared/lanes';
import { ScrollFilter } from './scrollFilter';

type Axis = 'x' | 'y';

export interface SteadyScrollHandle {
  setEnabled(on: boolean): void;
  enabled(): boolean;
  /** How many wheel movements have been dropped since the page loaded. */
  dropped(): number;
}

interface Glide {
  target: { x: number; y: number };
  raf: number;
}

const EASE = 0.22; // the share of the remaining distance covered each frame
const MAX_FRAMES = 90; // a glide never runs longer than about 1.5 s
const SCROLLING = /^(auto|scroll|overlay)$/;

const position = (el: Element, axis: Axis): number => (axis === 'y' ? el.scrollTop : el.scrollLeft);
const furthest = (el: Element, axis: Axis): number => (axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth);
const hasRoom = (el: Element, axis: Axis, dir: number): boolean => (dir > 0 ? position(el, axis) < furthest(el, axis) - 0.5 : position(el, axis) > 0.5);

/** The thing under the pointer that should scroll for this movement: the nearest scrollable box with room, else the page. */
export function scrollerFor(start: Element, axis: Axis, dir: number): Element | null {
  const root = document.scrollingElement ?? document.documentElement;
  for (let el: Element | null = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    if (SCROLLING.test(overflow) && furthest(el, axis) > 1 && hasRoom(el, axis, dir)) return el;
  }
  return hasRoom(root, axis, dir) ? root : null;
}

export function startSteadyScroll(ctx: LaneContext): SteadyScrollHandle {
  let on = false;
  let dropped = 0;
  let stopped = false;
  const filters: Record<Axis, ScrollFilter> = { x: new ScrollFilter(), y: new ScrollFilter() };
  const glides = new WeakMap<Element, Glide>();

  const glide = (el: Element, axis: Axis, step: number) => {
    let g = glides.get(el);
    if (!g) {
      g = { target: { x: 0, y: 0 }, raf: 0 };
      glides.set(el, g);
    }
    const state = g;
    if (!state.raf) {
      // Nothing is gliding: start from wherever the page really is (the keyboard may have moved it).
      state.target.x = el.scrollLeft;
      state.target.y = el.scrollTop;
    }
    state.target[axis] = Math.min(Math.max(state.target[axis] + step, 0), Math.max(0, furthest(el, axis)));
    if (state.raf) return;
    let frames = 0;
    const frame = () => {
      state.raf = 0;
      if (stopped) return;
      const next = { left: el.scrollLeft, top: el.scrollTop };
      let moving = false;
      for (const a of ['x', 'y'] as Axis[]) {
        const here = position(el, a);
        const gap = state.target[a] - here;
        if (Math.abs(gap) < 0.5) continue;
        // Browsers round scroll positions to whole pixels, so always move at least one and never overshoot.
        const move = Math.sign(gap) * Math.min(Math.abs(gap), Math.max(1, Math.abs(gap) * EASE));
        const to = Math.abs(gap) < 1.5 ? state.target[a] : here + move;
        if (a === 'x') next.left = to;
        else next.top = to;
        moving = true;
      }
      // "instant" so a page that smooths its own scrolling does not fight the glide.
      el.scrollTo({ left: next.left, top: next.top, behavior: 'instant' });
      frames += 1;
      if (moving && frames < MAX_FRAMES) state.raf = requestAnimationFrame(frame);
    };
    state.raf = requestAnimationFrame(frame);
  };

  const onWheel = (event: WheelEvent) => {
    // Pinch zoom, shortcuts and anything the page made up are left alone.
    if (!on || !event.isTrusted || event.ctrlKey || event.metaKey || event.altKey || !(event.target instanceof Element)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const axis: Axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 'x' : 'y';
    const raw = (axis === 'x' ? event.deltaX : event.deltaY) * unit;
    if (raw === 0) return;
    const el = scrollerFor(event.target, axis, Math.sign(raw));
    // Nothing to scroll that way (the top or bottom): leave it to the page.
    if (!el) return;
    event.preventDefault();
    const step = filters[axis].accept(event.timeStamp, raw);
    if (step === 0) {
      dropped += 1;
      return;
    }
    glide(el, axis, step);
  };
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  ctx.onStop(() => {
    stopped = true;
    window.removeEventListener('wheel', onWheel, { capture: true });
  });

  return {
    setEnabled(next) {
      on = next;
      if (!next) {
        filters.x.reset();
        filters.y.reset();
      }
    },
    enabled: () => on,
    dropped: () => dropped,
  };
}

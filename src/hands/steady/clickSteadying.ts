// Click steadying. Owner: A.
// 1. Highlights the button the click will land on, before the click.
// 2. A click that misses every button, but lands within a short reach of one, goes to that button.
//
// The safety limit (the plan's "never pay, delete or submit"): a button the page map won't allow
// is never highlighted and never steered to. Those need a real press, so a click that lands right
// on one is left alone too. Only a click that misses everything is steered.

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import { STEADY_UI_ATTR, type PageMapApi } from '@/shared/pagemap';
import type { Point } from '../filter/pointerFilter';
import type { PointerTracker } from '../pointer';
import { DEFAULT_REACH, distanceToRect } from './target';
import type { ClickBus } from '../clicks';
import { createTargeting } from './targeting';

const HIGHLIGHT_ID = 'steady-click-target';
/** A press that moves further than this between down and up is a drag, not a click. */
const DRAG_PX = 8;

export interface ClickSteadyingDeps {
  pageMap: PageMapApi;
  overlay: Overlay;
  tracker: PointerTracker;
  /** Where clicks are reported. A steered click reports the button; a click on nothing reports a miss. */
  bus?: ClickBus;
}

export function startClickSteadying(ctx: LaneContext, { pageMap, overlay, tracker, bus }: ClickSteadyingDeps, reach = DEFAULT_REACH): void {
  const { intended: intendedAt, liveSeen } = createTargeting(pageMap);
  const intended = (p: Point): string | null => intendedAt(p, reach);

  // ---- 1. Show which button the click will land on ----
  let shown: string | null = null;
  const refresh = (steady: Point) => {
    const id = intended(steady);
    if (id === shown) return;
    shown = id;
    if (id) overlay.show({ id: HIGHLIGHT_ID, where: () => liveSeen(id), tone: 'info' });
    else overlay.hide(HIGHLIGHT_ID);
  };
  let waiting = false;
  const stopListening = tracker.onMove(({ steady }) => {
    // At most once a frame: the page map is cached, but there is no need to redo this per event.
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => {
      waiting = false;
      refresh(steady);
    });
  });

  // ---- 2. Send a missed click to the button that was meant ----
  let downAt: Point | null = null;
  const onDown = (event: PointerEvent) => {
    downAt = { x: event.clientX, y: event.clientY };
  };
  /** Send a click that missed everything to the button that was meant. Returns that button, or null if it didn't. */
  const steer = (event: MouseEvent, at: Point): HTMLElement | null => {
    const steady = tracker.steady();
    const id = steady && intended(steady);
    if (!id) return null;
    const rect = liveSeen(id);
    if (!rect || distanceToRect(at, rect) > reach * 1.5) return null; // the click itself must also be close
    const target = pageMap.elementFor(id);
    if (!(target instanceof HTMLElement)) return null;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.click();
    return target;
  };

  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const landed = event.target;
    // A click on Steady's own panel or pop-up is never a miss: don't steer it to a page button behind it.
    if (landed.closest(`[${STEADY_UI_ATTR}]`)) return;
    const at = { x: event.clientX, y: event.clientY };
    const plain = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const dragged = !!downAt && Math.hypot(at.x - downAt.x, at.y - downAt.y) > DRAG_PX;
    // Landed on a button, link or field: leave it alone. Only a click that hit nothing can be steered or counted as a miss.
    const onNothing = plain && !dragged && !pageMap.describe(landed);
    const steeredTo = onNothing ? steer(event, at) : null;
    if (steeredTo) {
      bus?.emitClick(steeredTo);
      return;
    }
    bus?.emitClick(landed);
    if (onNothing) bus?.emitMiss(at);
  };

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('click', onClick, true);
  ctx.onStop(() => {
    stopListening();
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('click', onClick, true);
    overlay.hide(HIGHLIGHT_ID);
  });
}

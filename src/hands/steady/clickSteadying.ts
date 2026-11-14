// Click steadying. Owner: A.
// 1. Highlights the button the click will land on, before the click.
// 2. A click that misses every button, but lands within a short reach of one, goes to that button.
//
// The safety limit (the plan's "never pay, delete or submit"): a button the page map won't allow
// is never highlighted and never steered to. Those need a real press, so a click that lands right
// on one is left alone too. Only a click that misses everything is steered.

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import type { PageMapApi, Rect } from '@/shared/pagemap';
import type { Point } from '../filter/pointerFilter';
import type { PointerTracker } from '../pointer';
import { DEFAULT_REACH, distanceToRect, pickNearest, type Candidate } from './target';

const KINDS = new Set(['button', 'link', 'checkbox', 'radio']);
/** Things a link can wrap whose size the link's own box doesn't show (a picture on a line with no height). */
const PICTURE = 'img, svg, picture, video, canvas, [role="img"]';
const HIGHLIGHT_ID = 'steady-click-target';
/** A press that moves further than this between down and up is a drag, not a click. */
const DRAG_PX = 8;

export interface ClickSteadyingDeps {
  pageMap: PageMapApi;
  overlay: Overlay;
  tracker: PointerTracker;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/**
 * What the person sees as the button. A link around a picture can have a box a few pixels tall while
 * the picture is much bigger, so the pictures inside count too. Only for links in the top page; frames
 * keep the page map's own numbers.
 */
function seenRect(el: Element | null, base: Rect): Rect {
  if (!el || el.ownerDocument !== document) return base;
  let out = base;
  let count = 0;
  for (const pic of el.querySelectorAll(PICTURE)) {
    if (++count > 8) break;
    const r = pic.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out = union(out, { x: r.x, y: r.y, width: r.width, height: r.height });
  }
  return out;
}

export function startClickSteadying(ctx: LaneContext, { pageMap, overlay, tracker }: ClickSteadyingDeps, reach = DEFAULT_REACH): void {
  /** Where the button is right now, as the person sees it. */
  const liveSeen = (id: string): Rect | null => {
    const base = pageMap.liveRect(id);
    return base && seenRect(pageMap.elementFor(id), base);
  };

  const candidates = (): Candidate[] => {
    const map = pageMap.get({ visibleOnly: true });
    const out: Candidate[] = [];
    for (const e of map.elements) {
      if (!KINDS.has(e.kind) || !e.visible || !e.inViewport || e.covered || e.disabled || e.inferred) continue;
      if (map.dialog && !e.inDialog) continue;
      out.push({ id: e.id, rect: e.kind === 'link' ? seenRect(pageMap.elementFor(e.id), e.rect) : e.rect });
    }
    return out;
  };

  /** The id of the button a click at this point should go to, or null. */
  const intended = (p: Point): string | null => {
    const hit = pickNearest(p, candidates(), reach);
    if (!hit) return null;
    const el = pageMap.elementFor(hit.id);
    if (!el || !pageMap.mayAutoClick(el).allowed) return null;
    return hit.id;
  };

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
  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof Element)) return;
    const at = { x: event.clientX, y: event.clientY };
    if (downAt && Math.hypot(at.x - downAt.x, at.y - downAt.y) > DRAG_PX) return;
    // It landed on a button, link or field: leave it alone.
    if (pageMap.describe(event.target)) return;
    const steady = tracker.steady();
    const id = steady && intended(steady);
    if (!id) return;
    const rect = liveSeen(id);
    if (!rect || distanceToRect(at, rect) > reach * 1.5) return; // the click itself must also be close
    const target = pageMap.elementFor(id);
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.click();
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

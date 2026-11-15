// Which button is the pointer on, or near? Shared by click steadying and dwell click. Owner: A.
// The page map says what is clickable and what is protected. This only does the pointing.

import { STEADY_UI_ATTR, type PageMapApi, type Rect } from '@/shared/pagemap';
import type { Point } from '../filter/pointerFilter';
import { pickNearest, type Candidate } from './target';

const KINDS = new Set(['button', 'link', 'checkbox', 'radio']);
/** Things a link can wrap whose size the link's own box doesn't show (a picture on a line with no height). */
const PICTURE = 'img, svg, picture, video, canvas, [role="img"]';

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
export function seenRect(el: Element | null, base: Rect): Rect {
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

export interface Targeting {
  /** The id of the button a click at this point should go to, or null. Never a protected, fake or disabled one. */
  intended(p: Point, reach: number): string | null;
  /** Where that button is right now, as the person sees it. */
  liveSeen(id: string): Rect | null;
}

/** True if the topmost thing under this point is Milo's own panel or pop-up. The overlay itself is click-through, so it is skipped. */
function underSteadyUi(p: Point): boolean {
  const top = document.elementFromPoint(p.x, p.y);
  return !!top && !!top.closest(`[${STEADY_UI_ATTR}]`);
}

export function createTargeting(pageMap: PageMapApi): Targeting {
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

  return {
    intended(p, reach) {
      // The pointer is on one of Milo's own pop-ups (Pay Pause, the panel): never point through it to a page button.
      if (underSteadyUi(p)) return null;
      const hit = pickNearest(p, candidates(), reach);
      if (!hit) return null;
      const el = pageMap.elementFor(hit.id);
      if (!el || !pageMap.mayAutoClick(el).allowed) return null;
      return hit.id;
    },
    liveSeen(id) {
      const base = pageMap.liveRect(id);
      return base && seenRect(pageMap.elementFor(id), base);
    },
  };
}

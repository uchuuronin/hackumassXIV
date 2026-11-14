// Fake-button check: finds buttons that live inside an advert and marks them. Owner: B.
// Rule based on purpose: instant, free, works offline, and never sends the page anywhere.
import { pageMap } from '@/guide';
import { getOverlay } from '@/hands';
import type { LaneContext } from '@/shared/lanes';

// Words that clearly mean an advert (any case). "ad" counts only inside a compound like "top-ad" or
// "ad-slot", in lower case, so Gmail's one-word class "AD" for its compose window is not caught.
const AD_WORDS = /(^|[\s_-])(advert|advertisement|adslot|sponsored)([\s_-]|$)/i;
const AD_COMPOUND = /(^|\s)(ads?)[-_][a-z]|[a-z0-9][-_](ads?)(\s|$)/;
const AD_SRC = /doubleclick|googlesyndication|adservice|adsystem|\/ads?\/|banner/i;
const AD_TAG = /^(ad|ads|advert|advertisement|sponsored)$/i;
const BAIT = /download|install|update|speed|scan|virus|clean|claim|prize|winner|free gift|your pc/i;

/** The element one level up, climbing out of a frame into the page around it. */
function outer(n: Element): Element | null {
  try {
    return n.parentElement ?? n.ownerDocument.defaultView?.frameElement ?? null;
  } catch {
    return null;
  }
}

/** True if the node sits inside something that calls itself an advert. */
function inAdvert(node: Element): boolean {
  for (let n: Element | null = node; n; n = outer(n)) {
    // A small "Ad" or "Sponsored" tag inside the box.
    for (const c of Array.from(n.children)) {
      if (c.children.length === 0 && AD_TAG.test((c.textContent ?? '').trim())) return true;
    }
    if (n.tagName === 'BODY' || n.tagName === 'HTML') continue;
    const className = typeof n.className === 'string' ? n.className : '';
    const words = `${n.id} ${className} ${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('title') ?? ''}`;
    if (AD_WORDS.test(words) || AD_COMPOUND.test(words) || n.hasAttribute('data-ad') || n.hasAttribute('data-ad-slot')) return true;
  }
  return false;
}

export function startFakeCheck(ctx: LaneContext): void {
  const marked = new Map<string, string>(); // id -> reason
  let shownFrames = new Set<string>();

  function scan() {
    const map = pageMap.get();
    const now = new Map<string, string>();
    for (const el of map.elements) {
      const kind = String(el.kind);
      if (!el.visible || (kind !== 'button' && kind !== 'link')) continue;
      const node = pageMap.elementFor(el.id);
      if (!node || !inAdvert(node)) continue;
      now.set(
        el.id,
        BAIT.test(el.label)
          ? 'This is an advert pretending to be a download. Do not click it.'
          : 'This is an advert, not part of this page.',
      );
    }
    for (const [id, reason] of now) {
      if (marked.has(id)) continue;
      pageMap.mark(id, 'fake', reason);
      marked.set(id, reason);
    }
    for (const id of [...marked.keys()]) {
      if (now.has(id)) continue;
      pageMap.unmark(id, 'fake');
      getOverlay().hide(`fake-${id}`);
      marked.delete(id);
    }
    // Draw a warning on the ones in view (at most two, so the page stays readable).
    let drawn = 0;
    for (const [id, reason] of marked) {
      const el = map.elements.find((e) => e.id === id);
      if (el?.inViewport && !el.covered && drawn < 2) {
        getOverlay().show({ id: `fake-${id}`, where: () => pageMap.liveRect(id), label: reason, tone: 'warning' });
        drawn++;
      } else {
        getOverlay().hide(`fake-${id}`);
      }
    }
    // Adverts in frames from other sites: we can't see inside, so warn about the whole frame.
    const frameIds = new Set<string>();
    map.frames.forEach((f, i) => {
      if (f.sameSite || !f.visible) return;
      const iframe = Array.from(document.querySelectorAll('iframe')).find((x) => x.src === f.src);
      if (!iframe || (!inAdvert(iframe) && !AD_SRC.test(f.src))) return;
      const id = `fake-frame-${i}`;
      frameIds.add(id);
      getOverlay().show({
        id,
        where: () => {
          const r = iframe.getBoundingClientRect();
          return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        },
        label: 'This is an advert, not part of this page.',
        tone: 'warning',
      });
    });
    for (const id of shownFrames) if (!frameIds.has(id)) getOverlay().hide(id);
    shownFrames = frameIds;
    console.log('[Steady] fake scan', { marked: [...marked.keys()], drawn, frames: frameIds.size });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 400); };
  // Ignore 'marks' changes, or putting a mark would trigger another scan.
  const stop = pageMap.onChange((why) => { if (why !== 'marks') schedule(); });
  schedule();
  const retries = [1500, 4000].map((ms) => setTimeout(scan, ms));

  ctx.onStop(() => {
    stop();
    clearTimeout(timer);
    retries.forEach(clearTimeout);
    for (const id of marked.keys()) getOverlay().hide(`fake-${id}`);
    for (const id of shownFrames) getOverlay().hide(id);
    pageMap.clearMarks('fake');
  });
}

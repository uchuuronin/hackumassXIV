// What a label must not cover: the page's buttons, links, fields, prices and frames. Owner: A.
// Read from the page map. Labels can't see plain paragraphs, so they may still land on body text.

import { STEADY_UI_ATTR, type PageMapApi, type Rect } from '@/shared/pagemap';

export interface Obstacles {
  rects: Rect[];
  /** Changes when the page map was rebuilt (the page changed or scrolled). */
  version: number;
}

const MAX_TEXT_BLOCKS = 400;

/** Boxes of the visible text on screen, so a label doesn't cover a sentence or a price line. */
function textRects(doc: Document): Rect[] {
  const out: Rect[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let node = walker.nextNode(); node && out.length < MAX_TEXT_BLOCKS; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || seen.has(parent) || !node.textContent?.trim() || parent.closest(`[${STEADY_UI_ATTR}], script, style, noscript`)) continue;
    seen.add(parent);
    const range = doc.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) {
      out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
    }
  }
  return out;
}

export function pageObstacles(pageMap: PageMapApi, doc: Document = document): () => Obstacles {
  let cached: { version: number; text: Rect[] } | undefined;
  return () => {
    const map = pageMap.get({ visibleOnly: true });
    const rects: Rect[] = [];
    for (const e of map.elements) if (e.visible && e.inViewport) rects.push(e.rect);
    for (const a of map.amounts) rects.push(a.rect);
    for (const f of map.frames) if (f.visible) rects.push(f.rect);
    // Text is looked up again only when the page map was rebuilt, since walking the page is the costly part.
    if (!cached || cached.version !== map.takenAt) cached = { version: map.takenAt, text: textRects(doc) };
    return { rects: [...rects, ...cached.text], version: map.takenAt };
  };
}

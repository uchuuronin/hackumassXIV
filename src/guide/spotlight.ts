// Feature 5, "Spotlight": during a guided step, the rest of the page is dimmed.
// C decides what to light and when. A's overlay does the drawing.

import { need } from '@/shared/ports';
import { pageMap } from './map';

export type SpotlightResult = { ok: true } | { ok: false; said: string };

const GONE = 'I can\'t find that on this page any more. The page may have changed. You can press "I\'m stuck" and we will ask for help.';

let current: { id: string; stopWatching: () => void } | null = null;

/** Light one element. Brings it into view first, gently. Says so, in plain words, when it can't. */
export async function on(id: string, text?: string, options: { dim?: boolean } = {}): Promise<SpotlightResult> {
  off();
  const el = pageMap.elementFor(id);
  if (!el || !pageMap.liveRect(id)) return { ok: false, said: GONE };

  await bringIntoView(el, id);

  const data = pageMap.describe(el);
  if (!data) return { ok: false, said: GONE };
  if (data.covered) {
    const box = pageMap.get().dialog?.label;
    const blocker = box ? `A box called "${box}" is` : 'Something on the page is';
    return { ok: false, said: `${blocker} in the way of "${data.label}". Close that box first, then ask me again.` };
  }

  need('overlay').spotlight(options.dim === false ? { targetId: id, text, dim: false } : { targetId: id, text });
  pageMap.mark(el, 'current-step', 'This is the step you are on.');
  // If the page changes and the step is no longer there, don't leave a light on nothing.
  const stopWatching = pageMap.onChange(() => {
    if (current?.id === id && (!pageMap.elementFor(id) || !pageMap.liveRect(id))) off();
  });
  current = { id, stopWatching };
  return { ok: true };
}

export function off(): void {
  if (!current) return;
  const { id, stopWatching } = current;
  current = null;
  stopWatching();
  pageMap.unmark(id, 'current-step');
  need('overlay').spotlight(null);
}

/** The id of the element that is lit, if any. */
export function lit(): string | null {
  return current?.id ?? null;
}

function fullyOnScreen(id: string): boolean {
  const r = pageMap.liveRect(id);
  if (!r) return false;
  const margin = 80; // room for a label beside it
  return r.y >= margin && r.y + r.height <= window.innerHeight - margin && r.x >= 0 && r.x + r.width <= window.innerWidth;
}

/** "Nothing moves suddenly": scroll smoothly, unless the person has asked their computer for no motion. */
async function bringIntoView(el: Element, id: string): Promise<void> {
  if (fullyOnScreen(id)) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  // Wait for the page to stop moving, so the light lands in the right place.
  let last = -1;
  let still = 0;
  for (let i = 0; i < 40 && still < 3; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const y = pageMap.liveRect(id)?.y ?? -1;
    still = y === last ? still + 1 : 0;
    last = y;
  }
}

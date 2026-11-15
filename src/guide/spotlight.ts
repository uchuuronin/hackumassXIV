// Feature 5, "Spotlight": during a guided step, the rest of the page is dimmed.
// C decides what to light and when. A's overlay does the drawing.

import { need } from '@/shared/ports';
import { pageMap } from './map';

export type SpotlightResult = { ok: true } | { ok: false; said: string };

const GONE = 'I can\'t find that on this page any more. The page may have changed. You can press "I\'m stuck" and we\'ll ask for help.';

let current: { id: string; stopWatching: () => void } | null = null;

/** How often a lit step is checked for something opening on top of it. */
const LOOK_MS = 250;

/** Light one element. Brings it into view first, gently. Says so, in plain words, when it can't. */
export async function on(id: string, text?: string, options: { dim?: boolean; group?: string[] } = {}): Promise<SpotlightResult> {
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

  const target: { targetId: string; text?: string; dim?: boolean; group?: string[] } = { targetId: id, text };
  if (options.dim === false) target.dim = false;
  if (options.group && options.group.length > 1) target.group = options.group;
  need('overlay').spotlight(target);
  pageMap.mark(el, 'current-step', 'This is the step you are on.');
  // If the page changes and the step is no longer there, don't leave a light on nothing.
  const unwatch = pageMap.onChange(() => {
    if (current?.id === id && (!pageMap.elementFor(id) || !pageMap.liveRect(id))) off();
  });
  // When she clicks a list or a date, the hands lane opens its big chooser on top (Big Pick). That chooser
  // is now the thing to look at, so the light and the dimming step aside, and come back when it closes.
  // Otherwise the page's little box stays lit behind the chooser and the chooser itself is dimmed.
  let aside = false;
  const look = window.setInterval(() => {
    if (current?.id !== id) return;
    const now = pageMap.elementFor(id);
    const covered = !!now && !!pageMap.describe(now)?.covered;
    if (covered === aside) return;
    aside = covered;
    need('overlay').spotlight(covered ? null : target);
  }, LOOK_MS);
  const stopWatching = () => {
    unwatch();
    window.clearInterval(look);
  };
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

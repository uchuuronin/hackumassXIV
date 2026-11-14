// Puts the double-key guard on the page. Owner: A.
// Only typing into a box is guarded; the same key pressed on a page that isn't a text box is left alone.

import type { LaneContext } from '@/shared/lanes';
import { KeyGuard } from './keyGuard';

const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable=""], [contenteditable="true"]';

export interface KeyGuardHandle {
  /** The shortest gap between two hits of one key, in ms. 0 is off. */
  setMs(ms: number): void;
  ms(): number;
  /** How many doubles have been dropped since the page loaded. */
  dropped(): number;
}

export function startKeyGuard(ctx: LaneContext, onDrop?: (target: Element) => void): KeyGuardHandle {
  const guard = new KeyGuard(0);
  let dropped = 0;
  const onKey = (event: KeyboardEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element) || !event.target.matches(TYPING)) return;
    const hit = {
      code: event.code,
      key: event.key,
      t: event.timeStamp,
      repeat: event.repeat,
      shortcut: event.ctrlKey || event.metaKey || event.altKey,
    };
    if (!guard.shouldDrop(hit)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dropped += 1;
    onDrop?.(event.target);
  };
  window.addEventListener('keydown', onKey, true);
  ctx.onStop(() => window.removeEventListener('keydown', onKey, true));
  return {
    setMs(ms) {
      guard.guardMs = Math.min(400, Math.max(0, ms));
      guard.reset();
    },
    ms: () => guard.guardMs,
    dropped: () => dropped,
  };
}

// Dwell click. Owner: A.
// Hold the pointer still on a button or link and a ring fills. When it is full, it clicks. No press
// is needed, because pressing can jerk the pointer off the button. Moving away cancels it.
//
// Safety limit: only buttons the page map allows (`mayAutoClick`). Never pay, delete, submit, fake or
// disabled ones. Those need a real press.
//
// Off by default. The fitting turns it on for people whose clicks slip.

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import type { PageMapApi } from '@/shared/pagemap';
import type { ClickBus } from '../clicks';
import type { PointerTracker } from '../pointer';
import { createTargeting } from '../steady/targeting';
import { DEFAULT_DWELL, DwellTimer } from './dwellTimer';

/** How far outside a button's edge still counts as on it. Resting a finger-width of shake on the edge is common. */
const EDGE_PX = 4;

export interface DwellClick {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  dwellMs(): number;
  setDwellMs(ms: number): void;
}

export interface DwellDeps {
  pageMap: PageMapApi;
  overlay: Overlay;
  tracker: PointerTracker;
  bus?: ClickBus;
}

export function startDwellClick(ctx: LaneContext, { pageMap, overlay, tracker, bus }: DwellDeps): DwellClick {
  const { intended } = createTargeting(pageMap);
  const timer = new DwellTimer({ ...DEFAULT_DWELL });
  let on = false;
  let frame = 0;
  let stopListening: (() => void) | undefined;

  const clear = () => {
    timer.reset();
    overlay.setDwell(null);
  };

  const tick = () => {
    frame = 0;
    const at = tracker.steady();
    if (!on || !at) return clear();
    const id = intended(at, EDGE_PX);
    const state = timer.update(id, at, performance.now());
    overlay.setDwell(state.progress > 0 && !state.fire ? state.progress : null, at);
    if (state.fire && id) {
      // Check again at the last moment: the page may have changed under the pointer.
      const el = pageMap.elementFor(id);
      if (el instanceof HTMLElement && pageMap.mayAutoClick(el).allowed) {
        el.click();
        bus?.emitClick(el); // a dwell click is a click the person meant
      }
    }
    // Keep going while there is a button under the pointer. A new move starts the loop again.
    if (id && !state.fire) frame = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (on && !frame) frame = requestAnimationFrame(tick);
  };

  // A real press means the person clicked by hand. Don't also dwell-click the same button.
  const onRealClick = (event: MouseEvent) => {
    if (event.isTrusted) timer.pressedForReal();
  };
  window.addEventListener('click', onRealClick, true);

  const api: DwellClick = {
    enabled: () => on,
    setEnabled(next) {
      if (next === on) return;
      on = next;
      clear();
      if (on) stopListening = tracker.onMove(wake);
      else {
        stopListening?.();
        stopListening = undefined;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    dwellMs: () => timer.options.dwellMs,
    setDwellMs(ms) {
      timer.options.dwellMs = Math.min(5000, Math.max(300, ms));
    },
  };

  ctx.onStop(() => {
    api.setEnabled(false);
    window.removeEventListener('click', onRealClick, true);
    overlay.setDwell(null);
  });
  return api;
}

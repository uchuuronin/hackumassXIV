// Dev-only tuning mode for the tremor filter. Owner: A.
// Alt+Shift+T switches it on and off. The red dot is the real pointer, the blue ring is the steadied one.
// Move the mouse, shake it, and change the settings until the ring feels right.
//
//   Alt+Shift+[ / ]   lowest cutoff   down / up   (lower = steadier, laggier)
//   Alt+Shift+; / '   beta            down / up   (higher = less lag on quick moves)
//   Alt+Shift+- / =   tremor Hz       down / up   (set to the shake you are making)
//   Alt+Shift+N       notch on / off

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import { PointerFilter } from './filter/pointerFilter';

const round = (n: number, places = 2) => Number(n.toFixed(places));

export function startTuning(ctx: LaneContext, overlay: Overlay, filter: PointerFilter): void {
  let on = false;

  const status = () => {
    const o = filter.options;
    overlay.show({
      id: 'tuning-status',
      box: false,
      where: { x: 16, y: 16, width: 1, height: 1 },
      label: `Tuning: tremor ${o.tremorHz} Hz, notch ${o.notch ? 'on' : 'off'}, cutoff ${o.minCutoff}, beta ${o.beta}`,
      tone: 'step',
    });
  };

  const onMove = (event: PointerEvent) => {
    const samples = event.getCoalescedEvents?.() ?? [];
    let steady = { x: event.clientX, y: event.clientY };
    for (const s of samples.length ? samples : [event]) steady = filter.filter(s.clientX, s.clientY, s.timeStamp);
    overlay.setCursor({ raw: { x: event.clientX, y: event.clientY }, steady });
  };

  const change = (event: KeyboardEvent) => {
    const o = filter.options;
    switch (event.code) {
      case 'BracketLeft': return filter.setOptions({ minCutoff: round(Math.max(0.1, o.minCutoff - 0.1)) });
      case 'BracketRight': return filter.setOptions({ minCutoff: round(o.minCutoff + 0.1) });
      case 'Semicolon': return filter.setOptions({ beta: round(Math.max(0, o.beta - 0.01)) });
      case 'Quote': return filter.setOptions({ beta: round(o.beta + 0.01) });
      case 'Minus': return filter.setOptions({ tremorHz: round(Math.max(2, o.tremorHz - 0.5), 1) });
      case 'Equal': return filter.setOptions({ tremorHz: round(Math.min(20, o.tremorHz + 0.5), 1) });
      case 'KeyN': return filter.setOptions({ notch: !o.notch });
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (!(event.altKey && event.shiftKey)) return;
    if (event.code === 'KeyT') {
      on = !on;
      filter.reset();
      if (on) {
        window.addEventListener('pointermove', onMove, true);
        status();
      } else {
        window.removeEventListener('pointermove', onMove, true);
        overlay.setCursor({ raw: null, steady: null });
        overlay.hide('tuning-status');
      }
      return;
    }
    if (!on) return;
    change(event);
    status();
  };

  window.addEventListener('keydown', onKey, true);
  ctx.onStop(() => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointermove', onMove, true);
  });
}

// Hands lane (A): tremor filter, click steadying, Big Pick, reading adjustments, and the overlay.
//
// Other lanes import the overlay from here:
//   import { getOverlay } from '@/hands';
//   getOverlay().show({ id: 'x', where: () => pageMap.liveRect(id), label: 'Click this' });

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import { pageMap } from '@/guide';
import { PointerFilter } from './filter/pointerFilter';
import { createOverlay } from './overlay';
import { startTuning } from './tuning';

let overlay: (Overlay & { destroy(): void }) | undefined;

/** The one overlay for this page. Made on first use. */
export function getOverlay(): Overlay {
  overlay ??= createOverlay();
  return overlay;
}

export function startHands(ctx: LaneContext): void {
  getOverlay();
  ctx.onStop(() => {
    overlay?.destroy();
    overlay = undefined;
  });

  if (ctx.dev) {
    startTuning(ctx, getOverlay(), new PointerFilter());

    // While building: Alt+Shift+O labels the first few buttons on the page. Press again to clear.
    let on = false;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.code === 'KeyO')) return;
      on = !on;
      const o = getOverlay();
      o.clear();
      if (!on) return;
      pageMap
        .get({ visibleOnly: true })
        .elements.filter((e) => (e.kind === 'button' || e.kind === 'link') && e.visible && !e.covered)
        .slice(0, 4)
        .forEach((e) =>
          o.show({
            id: e.id,
            where: () => pageMap.liveRect(e.id),
            label: e.protection === 'none' ? e.label : `${e.label} (needs a real press)`,
            tone: e.protection === 'none' ? 'info' : 'warning',
          }),
        );
    };
    window.addEventListener('keydown', onKey, true);
    ctx.onStop(() => window.removeEventListener('keydown', onKey, true));
  }
}

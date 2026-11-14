// Hands lane (A): tremor filter, click steadying, Big Pick, reading adjustments, and the overlay.
//
// Other lanes import the overlay from here:
//   import { getOverlay } from '@/hands';
//   getOverlay().show({ id: 'x', where: () => pageMap.liveRect(id), label: 'Click this' });

import type { LaneContext } from '@/shared/lanes';
import type { Overlay } from '@/shared/overlay';
import { pageMap } from '@/guide';
import { getProfile, setProfile } from '@/helper/profile';
import { provide } from '@/shared/ports';
import { browser } from 'wxt/browser';
import { createClickBus } from './clicks';
import { startDwellClick, type DwellClick } from './dwell/dwellClick';
import { pageObstacles } from './obstacles';
import { createOverlay } from './overlay';
import { startPointer } from './pointer';
import { startClickSteadying } from './steady/clickSteadying';
import { startTuning } from './tuning';

let overlay: (Overlay & { destroy(): void }) | undefined;
let dwell: DwellClick | undefined;

const DWELL_KEY = 'hands:dwell' as const;
interface DwellSetting {
  enabled: boolean;
  ms: number;
}
const DWELL_OFF: DwellSetting = { enabled: false, ms: 1000 };

/** Dwell click, once the hands lane has started. The fitting and the helper switch it on and off here. */
export function getDwell(): DwellClick | undefined {
  return dwell;
}

/** The one overlay for this page. Made on first use. */
export function getOverlay(): Overlay {
  overlay ??= createOverlay(document, { obstacles: pageObstacles(pageMap) });
  return overlay;
}

export function startHands(ctx: LaneContext): void {
  getOverlay();
  const tracker = startPointer(ctx);
  // The one feed of clicks for every lane. Click steadying reports into it, and so does dwell click.
  const bus = createClickBus();
  provide('clicks', bus.port);
  startClickSteadying(ctx, { pageMap, overlay: getOverlay(), tracker, bus });

  // Dwell click is off until the fitting (or the dev hotkey) turns it on. The setting lives in the profile.
  const dwellNow = startDwellClick(ctx, { pageMap, overlay: getOverlay(), tracker, bus });
  dwell = dwellNow;
  const applyDwell = (setting: DwellSetting) => {
    dwellNow.setDwellMs(setting.ms);
    dwellNow.setEnabled(setting.enabled);
  };
  getProfile<DwellSetting>(DWELL_KEY, DWELL_OFF).then(applyDwell, () => undefined);
  const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[DWELL_KEY];
    if (area === 'local' && change) applyDwell((change.newValue as DwellSetting | undefined) ?? DWELL_OFF);
  };
  browser.storage.onChanged.addListener(onStorage);

  ctx.onStop(() => {
    browser.storage.onChanged.removeListener(onStorage);
    dwell = undefined;
    overlay?.destroy();
    overlay = undefined;
  });

  if (ctx.dev) {
    startTuning(ctx, getOverlay(), tracker);

    // While building: Alt+Shift+D turns dwell click on or off. It is remembered in the profile.
    const onDwellKey = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.code === 'KeyD')) return;
      const next = !dwellNow.enabled();
      applyDwell({ enabled: next, ms: dwellNow.dwellMs() });
      setProfile(DWELL_KEY, { enabled: next, ms: dwellNow.dwellMs() }).catch(() => undefined);
      const o = getOverlay();
      o.show({ id: 'dwell-status', box: false, where: { x: 16, y: 16, width: 1, height: 1 }, label: next ? `Dwell click on: hold still ${dwellNow.dwellMs() / 1000} s` : 'Dwell click off', tone: 'step' });
      setTimeout(() => o.hide('dwell-status'), 2000);
    };
    window.addEventListener('keydown', onDwellKey, true);
    ctx.onStop(() => window.removeEventListener('keydown', onDwellKey, true));

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

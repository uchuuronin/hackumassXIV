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
import { registerTool } from '@/helper/registry';
import { createClickBus } from './clicks';
import { createHandsTools } from './tools';
import { startKeyGuard } from './keys/startKeyGuard';
import { startDwellClick, type DwellClick } from './dwell/dwellClick';
import { pageObstacles } from './obstacles';
import { startBigPick } from './bigpick';
import { createOverlay } from './overlay';
import { startPointer } from './pointer';
import { startClickSteadying } from './steady/clickSteadying';
import { startTuning } from './tuning';
import { runFollowTheDot } from './fitting/follow';
import { settingsFromReading, type TremorReading } from './fitting/analysis';

let overlay: (Overlay & { destroy(): void; setVisible(visible: boolean): void }) | undefined;
let dwell: DwellClick | undefined;
let fitting: (() => Promise<FittingOutcome>) | undefined;

export interface FittingOutcome {
  ran: boolean;
  reading?: TremorReading | null;
  /** Plain words for the person. */
  said: string;
}

/** Start the fitting on this page. The helper and the panel call this. Undefined until the hands lane has started. */
export function startFitting(): Promise<FittingOutcome> {
  return fitting ? fitting() : Promise.resolve({ ran: false, said: 'The fitting is not ready on this page yet.' });
}

const TREMOR_HZ_KEY = 'hands:tremorHz' as const;
const REACH_KEY = 'hands:reach' as const;
const FITTING_KEY = 'hands:fitting' as const;
const SLIP_KEY = 'hands:slipPx' as const;
const KEY_GUARD_KEY = 'hands:keyGuardMs' as const;
const BIG_PICK_KEY = 'hands:bigPick' as const;

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
  // The helper's click and fill tools. They go through the same safety limit as steadied clicks.
  for (const tool of createHandsTools(pageMap, bus)) registerTool(tool);
  const steadying = startClickSteadying(ctx, { pageMap, overlay: getOverlay(), tracker, bus });

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
  // The fitting's results: how fast the hand shakes and how far a click can stray. Read at start and when they change.
  const keyGuard = startKeyGuard(ctx);
  const applyPointer = (hz: unknown, reach: unknown) => {
    if (typeof hz === 'number') tracker.filter.setOptions({ tremorHz: hz });
    if (typeof reach === 'number') steadying.setReach(reach);
  };
  const applyGuards = (slip: unknown, keyMs: unknown) => {
    if (typeof slip === 'number') steadying.setSlip(slip);
    if (typeof keyMs === 'number') keyGuard.setMs(keyMs);
  };
  Promise.all([getProfile<number | null>(TREMOR_HZ_KEY, null), getProfile<number | null>(REACH_KEY, null)]).then(([hz, reach]) => applyPointer(hz, reach), () => undefined);
  Promise.all([getProfile<number | null>(SLIP_KEY, null), getProfile<number | null>(KEY_GUARD_KEY, null)]).then(([slip, keyMs]) => applyGuards(slip, keyMs), () => undefined);
  const onPointerStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return;
    if (changes[TREMOR_HZ_KEY] || changes[REACH_KEY]) applyPointer(changes[TREMOR_HZ_KEY]?.newValue, changes[REACH_KEY]?.newValue);
    if (changes[SLIP_KEY] || changes[KEY_GUARD_KEY]) applyGuards(changes[SLIP_KEY]?.newValue, changes[KEY_GUARD_KEY]?.newValue);
  };
  browser.storage.onChanged.addListener(onPointerStorage);
  browser.storage.onChanged.addListener(onStorage);

  fitting = async () => {
    // Nothing else may show through: hide every label and box while the test runs, then bring them back.
    getOverlay().clear();
    overlay?.setVisible(false);
    const result = await runFollowTheDot(document, tracker).finally(() => overlay?.setVisible(true));
    if (!result.done) return { ran: false, said: 'No problem, the fitting was skipped.' };
    if (!result.reading) return { ran: true, reading: null, said: 'That was too short to measure. Please try again and follow the dot the whole time.' };
    const settings = settingsFromReading(result.reading);
    await setProfile(REACH_KEY, settings.reach);
    if (settings.tremorHz !== undefined) await setProfile(TREMOR_HZ_KEY, settings.tremorHz);
    await setProfile(FITTING_KEY, { at: Date.now(), hz: result.reading.hz, amplitudePx: result.reading.amplitudePx, clarity: result.reading.clarity });
    applyPointer(settings.tremorHz, settings.reach);
    const said =
      settings.tremorHz !== undefined
        ? `Your hand shakes about ${result.reading.hz} times a second. I've tuned the pointer to calm that, and clicks near a button now go to it.`
        : 'I could not find a clear shake, so I left the pointer smoothing as it was. Clicks near a button still go to it.';
    return { ran: true, reading: result.reading, said };
  };


  ctx.onStop(() => {
    browser.storage.onChanged.removeListener(onStorage);
    browser.storage.onChanged.removeListener(onPointerStorage);
    fitting = undefined;
    dwell = undefined;
    overlay?.destroy();
    overlay = undefined;
  });

  // Big Pick: dropdowns, date fields and number boxes open as large buttons. On unless the person turned it off.
  const bigPick = startBigPick(ctx, pageMap);
  getProfile<boolean>(BIG_PICK_KEY, true).then((on) => bigPick.setEnabled(on), () => bigPick.setEnabled(true));
  const onBigPickStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[BIG_PICK_KEY];
    if (area === 'local' && change) bigPick.setEnabled(change.newValue !== false);
  };
  browser.storage.onChanged.addListener(onBigPickStorage);
  ctx.onStop(() => browser.storage.onChanged.removeListener(onBigPickStorage));

  if (ctx.dev) {
    startTuning(ctx, getOverlay(), tracker);

    // While building: Alt+Shift+B turns Big Pick on or off. It is remembered in the profile.
    const onBigPickKey = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.code === 'KeyB')) return;
      const next = !bigPick.enabled();
      bigPick.setEnabled(next);
      setProfile(BIG_PICK_KEY, next).catch(() => undefined);
      const o = getOverlay();
      o.show({ id: 'bigpick-status', box: false, where: { x: 16, y: 16, width: 1, height: 1 }, label: next ? 'Big Pick on: dropdowns and dates open as large buttons' : 'Big Pick off', tone: 'step' });
      setTimeout(() => o.hide('bigpick-status'), 2500);
    };
    window.addEventListener('keydown', onBigPickKey, true);
    ctx.onStop(() => window.removeEventListener('keydown', onBigPickKey, true));

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

    // While building: Alt+Shift+K turns the double-key guard on (120 ms) or off. Remembered in the profile.
    const onGuardKey = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.code === 'KeyK')) return;
      const next = keyGuard.ms() > 0 ? 0 : 120;
      keyGuard.setMs(next);
      setProfile(KEY_GUARD_KEY, next).catch(() => undefined);
      const o = getOverlay();
      o.show({ id: 'keyguard-status', box: false, where: { x: 16, y: 16, width: 1, height: 1 }, label: next ? `Double-key guard on: a key hit twice within ${next} ms is typed once` : 'Double-key guard off', tone: 'step' });
      setTimeout(() => o.hide('keyguard-status'), 2500);
    };
    window.addEventListener('keydown', onGuardKey, true);
    ctx.onStop(() => window.removeEventListener('keydown', onGuardKey, true));

    // While building: Alt+Shift+G runs the fitting and shows what it found.
    const onFitKey = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.code === 'KeyG')) return;
      startFitting().then((outcome) => {
        const o = getOverlay();
        o.show({ id: 'fitting-result', box: false, where: { x: 16, y: 16, width: 1, height: 1 }, label: outcome.said, tone: 'step' });
        setTimeout(() => o.hide('fitting-result'), 8000);
      }, () => undefined);
    };
    window.addEventListener('keydown', onFitKey, true);
    ctx.onStop(() => window.removeEventListener('keydown', onFitKey, true));

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

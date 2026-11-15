// Helper lane (B).
import { browser } from 'wxt/browser';
import { pageMap } from '@/guide';
import { getOverlay } from '@/hands';
import type { LaneContext } from '@/shared/lanes';
import type { Msg, ToolResultMsg } from '@/shared/tools';
import { getTool, listTools, registerTool } from './registry';
import { startPause } from './pause';
import { startFakeCheck } from './fake';
import { startHomeTurf } from './sites';
import { startOverAsk } from './overask';
import { loadFeatures, watchFeatures, type FeatureId } from './features';

registerTool({
  name: 'point_at',
  description: 'Point at one thing on the page so the person can see it.',
  owner: 'helper',
  parameters: {
    id: { type: 'string', description: 'Element id from the page map', required: true },
    label: { type: 'string', description: 'Two or three plain words shown next to it' },
  },
  async run(args) {
    const id = String(args.id);
    const rect = pageMap.liveRect(id);
    if (!rect) return { ok: false, said: "I can't find that on the page any more." };
    getOverlay().show({ id: 'helper-point', where: () => pageMap.liveRect(id), label: typeof args.label === 'string' ? args.label : 'This one', tone: 'info' });
    setTimeout(() => getOverlay().hide('helper-point'), 10000);
    return { ok: true, said: 'Pointing at it.', data: { id, rect } };
  },
});

/** Returns a function that starts the feature when its switch is on and stops it when it goes off. */
function manage(ctx: LaneContext, id: FeatureId, start: (c: LaneContext) => void | Promise<void>) {
  let stops: Array<() => void> = [];
  let running = false;
  const sub: LaneContext = { dev: ctx.dev, onStop: (f) => { stops.push(f); } };
  const stop = () => {
    running = false;
    const fs = stops;
    stops = [];
    for (const f of fs) { try { f(); } catch (err) { console.error(`[Steady] stopping ${id}`, err); } }
  };
  ctx.onStop(stop);
  return (on: boolean) => {
    if (on === running) return;
    if (!on) { stop(); return; }
    running = true;
    Promise.resolve().then(() => start(sub)).catch((err) => console.error(`[Steady] ${id}`, err));
  };
}

export function startHelper(ctx: LaneContext): void {
  const parts: Array<[FeatureId, (c: LaneContext) => void | Promise<void>]> = [
    ['pause', startPause], ['fake', startFakeCheck], ['turf', startHomeTurf], ['overask', startOverAsk],
  ];
  const applies = parts.map(([id, start]) => ({ id, apply: manage(ctx, id, start) }));
  loadFeatures().then((f) => applies.forEach((a) => a.apply(f[a.id])));
  ctx.onStop(watchFeatures((f) => applies.forEach((a) => a.apply(f[a.id]))));
  const onMessage = (message: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
    const raw = message as { type?: string } | null;
    if (raw?.type === 'tool/list') {
      sendResponse({ type: 'tool/list', tools: listTools().map(({ name, description, parameters, owner }) => ({ name, description, parameters, owner })) });
      return true;
    }
    const msg = message as Partial<Msg> | null;
    if (msg?.type !== 'tool/run') return undefined;
    const tool = getTool(msg.name ?? '');
    if (!tool) {
      sendResponse({ type: 'tool/result', result: { ok: false, said: "I don't know how to do that yet." } });
      return true;
    }
    tool.run(msg.args ?? {}).then((result) => sendResponse({ type: 'tool/result', result }));
    return true;
  };
  browser.runtime.onMessage.addListener(onMessage);

  // While building: Alt+Shift+H runs point_at on the first visible element and logs the rect.
  const onKey = async (e: KeyboardEvent) => {
    if (!(e.altKey && e.shiftKey && e.code === 'KeyH')) return;
    const first = pageMap.get().elements.find((el) => el.visible);
    if (!first) return console.log('[Steady] helper: nothing visible');
    console.log('[Steady] helper point_at', first.id, await getTool('point_at')!.run({ id: first.id }));
  };
  if (ctx.dev) window.addEventListener('keydown', onKey, true);

  ctx.onStop(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    window.removeEventListener('keydown', onKey, true);
  });
}

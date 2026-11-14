// Guide lane (C). Other lanes import the page map from here:
//
//   import { pageMap } from '@/guide';
//   const map = pageMap.get();
//   const verdict = pageMap.mayAutoClick(event.target);

import { browser } from 'wxt/browser';
import type { LaneContext } from '@/shared/lanes';
import type { PageMapChanged, PageMapRequest, PageMapResponse, PageMapWatch } from '@/shared/pagemap';
import { createPageMap } from './pagemap';

export type { AmountHit } from './pagemap/amounts';
export { typeItYourself } from './words';

/** The page map for this page. One per content script. */
export const pageMap = createPageMap(document);

export function startGuide(ctx: LaneContext): void {
  // The side panel and the background worker ask for the map with a message.
  let watched = false;
  const onMessage = (message: unknown, _sender: unknown, sendResponse: (response: PageMapResponse | { ok: true }) => void) => {
    const request = message as Partial<PageMapRequest | PageMapWatch> | null;
    if (request?.type === 'pagemap/get') {
      sendResponse({ type: 'pagemap/result', map: pageMap.get(request.options) });
      return true;
    }
    if (request?.type === 'pagemap/watch') {
      watched = request.on === true;
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(onMessage);

  // Tell them when it goes out of date, but only a tab that is being watched and is in front.
  const stopWatching = pageMap.onChange((why) => {
    if (!watched || document.visibilityState !== 'visible') return;
    const note: PageMapChanged = { type: 'pagemap/changed', why, url: location.href };
    browser.runtime.sendMessage(note).catch(() => undefined);
  });

  // While building: Alt+Shift+M prints the map for the page you are on.
  const onKey = (event: KeyboardEvent) => {
    if (!(event.altKey && event.shiftKey && event.code === 'KeyM')) return;
    const map = pageMap.get();
    console.log(`[Steady] page map: ${map.stage.label}, ${map.elements.length} elements, built in ${map.tookMs} ms`, map);
    console.table(
      map.elements
        .filter((e) => e.visible)
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          label: e.context ? `${e.label} (${e.context})` : e.label,
          from: e.labelSource,
          sure: e.labelConfident,
          protection: e.protection,
          secret: e.secret ?? '',
          fillAs: e.fillAs ?? '',
          covered: e.covered,
        })),
    );
    console.table(map.amounts.map((a) => ({ kind: a.kind, label: a.label, text: a.text, renews: a.recurring ?? '', crossedOut: a.struck })));
  };
  if (ctx.dev) window.addEventListener('keydown', onKey, true);

  ctx.onStop(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    stopWatching();
    window.removeEventListener('keydown', onKey, true);
    pageMap.stop();
  });
}

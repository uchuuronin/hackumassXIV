// Guide lane (C). Other lanes import from here:
//
//   import { pageMap, guideTools } from '@/guide';
//   const verdict = pageMap.mayAutoClick(event.target);

import { browser } from 'wxt/browser';
import type { LaneContext } from '@/shared/lanes';
import type { PageMapChanged, PageMapRequest, PageMapResponse, PageMapWatch } from '@/shared/pagemap';
import { deviceStore } from '@/shared/device-store';
import { has, provide } from '@/shared/ports';
import type { GeminiAnswer, GeminiAsk, Tool } from '@/shared/tools';
import { registerTool } from '@/helper/registry';
import { hideChoicesTool, labelChoicesTool } from './choices';
import { modelVia } from './choices/prompt';
import { fillDetailsTool, fillNextTool, fillStopTool, fillTakeOutTool } from './details';
import { pageMap } from './map';
import * as recorder from './recorder';
import * as spotlight from './spotlight';

export type { AmountHit } from './pagemap/amounts';
export { typeItYourself } from './words';
export { pageMap, recorder, spotlight };
export * as choices from './choices';
export * as details from './details';

/** The guide lane's tools. Registered in B's tool list when the lane starts. */
export const guideTools: Tool[] = [labelChoicesTool, hideChoicesTool, fillDetailsTool, fillNextTool, fillTakeOutTool, fillStopTool];

export async function startGuide(ctx: LaneContext): Promise<void> {
  const cleanups: Array<() => void> = [];
  if (!has('store')) provide('store', deviceStore);
  guideTools.forEach(registerTool);
  // Gemini, for buttons Steady has no words of its own for. B's background worker holds the relay address.
  if (!has('model')) {
    provide(
      'model',
      modelVia(async (prompt) => {
        const ask: GeminiAsk = { type: 'gemini/ask', prompt };
        const answer = (await browser.runtime.sendMessage(ask)) as GeminiAnswer | undefined;
        if (!answer?.ok) throw new Error('the relay did not answer');
        return answer.text;
      }),
    );
  }

  // While building, and only until A and B provide the real pieces: something to look at.
  // Written as import.meta.env.DEV so none of it is in the build that ships.
  if (import.meta.env.DEV && ctx.dev) {
    const { createStandIns } = await import('./dev/standin');
    const { startTryIt } = await import('./dev/tryit');
    const standIns = createStandIns();
    if (!has('overlay')) provide('overlay', standIns.overlay);
    if (!has('speech')) provide('speech', standIns.speech);
    if (!has('clicks')) {
      const listeners = new Set<(target: Element) => void>();
      const onClick = (e: MouseEvent) => e.isTrusted && e.target instanceof Element && listeners.forEach((l) => l(e.target as Element));
      document.addEventListener('click', onClick, true);
      provide('clicks', {
        onClick(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      });
      cleanups.push(() => document.removeEventListener('click', onClick, true));
    }
    cleanups.push(standIns.stop, startTryIt());
  }

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

  // A recording under way carries on across page loads.
  await recorder.resume();

  ctx.onStop(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    stopWatching();
    spotlight.off();
    cleanups.forEach((stop) => stop());
    pageMap.stop();
  });
}
